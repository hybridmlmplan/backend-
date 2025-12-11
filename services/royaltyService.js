// services/royaltyService.js
// Royalty service — monthly distribution, cumulative rank percentages, STAR 3% until ₹35
// Usage:
//   const royaltyService = require('../services/royaltyService');
//   await royaltyService.distributeMonthlyRoyalty({ period: '2025-12' , performedBy: adminId, ctxReq });
//   await royaltyService.getUserRoyaltySummary(userId);

const mongoose = require('mongoose');
const { Types } = mongoose;

const User = require('../models/User');
const Wallet = require('../models/Wallet');
const BVLedger = require('../models/BVLedger');
const RoyaltyLedger = require('../models/RoyaltyLedger');
const Settings = require('../models/Settings');

// ---------------------------
// CONFIG: rank order & percents
// ---------------------------
const RANK_ORDER = [
  'STAR',
  'SILVER_STAR',
  'GOLD_STAR',
  'RUBY_STAR',
  'EMERALD_STAR',
  'DIAMOND_STAR',
  'CROWN_STAR',
  'AMBASSADOR_STAR',
  'COMPANY_STAR'
];

const RANK_PERCENT = {
  STAR: 3,           // special: only until user.starRoyaltyEarned < 35
  SILVER_STAR: 1,
  GOLD_STAR: 2,
  RUBY_STAR: 3,
  EMERALD_STAR: 4,
  DIAMOND_STAR: 5,
  CROWN_STAR: 6,
  AMBASSADOR_STAR: 7,
  COMPANY_STAR: 8
};

const STAR_LIMIT = 35; // ₹35 limit for STAR 3%

// ---------------------------
// Helper: compute cumulative percent for a given rank
// ---------------------------
function cumulativePercentForRank(rank) {
  let total = 0;
  for (const r of RANK_ORDER) {
    const p = RANK_PERCENT[r] || 0;
    total += p;
    if (r === rank) break;
  }
  return total;
}

// ---------------------------
// Helper: compute CTO BV for given period
// - period param is optional; if not passed, we consider unspent/this-month pool
// - For simplicity we sum BVLedger items with type MONTHLY_CTO_BV and createdAt in month if period provided
// ---------------------------
async function getCTOBVForPeriod(period = null) {
  // period format expected 'YYYY-MM' (eg '2025-12'). If null, sum all unconsumed CTO BV entries.
  const match = { type: 'MONTHLY_CTO_BV' };
  if (period) {
    // parse YYYY-MM to start & end
    const [y, m] = String(period).split('-').map(Number);
    if (!y || !m) throw new Error('Invalid period format. Use YYYY-MM');
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 1, 0, 0, 0)); // next month
    match.createdAt = { $gte: start, $lt: end };
  }

  const agg = await BVLedger.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  return (agg[0] && agg[0].total) ? Number(agg[0].total) : 0;
}

// ---------------------------
// computeRoyaltyForUser
// returns { percent, grossAmount, starHandledAmount, netAmount }
// ---------------------------
async function computeRoyaltyForUser(user, ctoBV) {
  if (!user || !user.rank) return { percent: 0, grossAmount: 0, starHandledAmount: 0, netAmount: 0 };

  const cumulativePercent = cumulativePercentForRank(user.rank); // includes STAR percent in sum

  const gross = (ctoBV * cumulativePercent) / 100;

  // Now apply STAR special rule: STAR's 3% must be capped at STAR_LIMIT per user
  let starHandled = 0;
  if (user.rank === 'STAR' || RANK_ORDER.indexOf(user.rank) >= 0) {
    // check if we need to deduct STAR portion that exceeds limit
    const starPercent = RANK_PERCENT.STAR || 0;
    const starPortion = (ctoBV * starPercent) / 100;

    const already = Number(user.starRoyaltyEarned || 0);
    if (already >= STAR_LIMIT) {
      // user already exhausted star limit -> remove star portion from gross
      starHandled = 0; // nothing to add as star portion
    } else {
      const remainingCap = STAR_LIMIT - already;
      const starEligible = Math.min(remainingCap, starPortion);
      starHandled = starEligible;
    }
  }

  // net amount is gross but ensure star portion does not exceed allowed; we compute net as:
  // gross_without_star + starHandled
  const starPercent = RANK_PERCENT.STAR || 0;
  const starPartOfGross = (ctoBV * starPercent) / 100;
  const grossWithoutStar = gross - starPartOfGross;
  const net = grossWithoutStar + starHandled;

  return {
    percent: cumulativePercent,
    grossAmount: Number(gross),
    starHandledAmount: Number(starHandled),
    netAmount: Number(net)
  };
}

// ---------------------------
// creditRoyaltyToUser (transaction-aware helper)
// - session optional mongoose session
// ---------------------------
async function creditRoyaltyToUser(userId, amount, period, session = null) {
  if (!amount || amount <= 0) return null;

  const RoyaltyLedgerDoc = {
    userId: Types.ObjectId(userId),
    amount: Number(amount),
    period,
    source: 'CTO_MONTHLY_ROYALTY',
    createdAt: new Date()
  };

  if (session) {
    await RoyaltyLedger.create([RoyaltyLedgerDoc], { session });
    // increment Wallet: royaltyIncome and balance
    await Wallet.updateOne({ userId: Types.ObjectId(userId) }, { $inc: { balance: Number(amount), royaltyIncome: Number(amount) } }, { session });
  } else {
    await RoyaltyLedger.create(RoyaltyLedgerDoc);
    await Wallet.updateOne({ userId: Types.ObjectId(userId) }, { $inc: { balance: Number(amount), royaltyIncome: Number(amount) } });
  }
  return true;
}

// ---------------------------
// distributeMonthlyRoyalty(options)
// options: { period: 'YYYY-MM' (required recommended), performedBy: adminId }
// Returns distribution report
// ---------------------------
async function distributeMonthlyRoyalty(options = {}) {
  const period = options.period || null; // recommended to pass 'YYYY-MM'
  const performedBy = options.performedBy || null;

  // compute CTO BV for period
  const CTO_BV = await getCTOBVForPeriod(period);
  if (!CTO_BV || CTO_BV <= 0) {
    return { ok: true, message: 'No CTO BV for period', CTO_BV: 0, distributions: [] };
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // fetch all users with a rank (we distribute only to ranked users)
    const usersCursor = User.find({ rank: { $exists: true, $ne: null } }).cursor();

    const distributions = [];
    for (let u = await usersCursor.next(); u != null; u = await usersCursor.next()) {
      const user = u; // doc

      const { percent, grossAmount, starHandledAmount, netAmount } = await computeRoyaltyForUser(user, CTO_BV);

      if (!netAmount || netAmount <= 0) continue;

      // credit to wallet & create ledger
      await creditRoyaltyToUser(user._id, netAmount, period || (new Date().toISOString().slice(0,7)), session);

      // if starHandledAmount > 0, increment user.starRoyaltyEarned
      if (starHandledAmount > 0) {
        // update user.starRoyaltyEarned within session
        await User.updateOne({ _id: user._id }, { $inc: { starRoyaltyEarned: starHandledAmount } }, { session });
      }

      distributions.push({
        userId: user._id.toString(),
        rank: user.rank,
        percent,
        grossAmount,
        starHandledAmount,
        credited: netAmount
      });
    }

    // Optionally: save a summary admin log (could be RoyaltyRun model) - omitted to keep to core models

    await session.commitTransaction();
    session.endSession();

    return { ok: true, CTO_BV, distributions, performedBy, period };
  } catch (err) {
    await session.abortTransaction().catch(()=>{});
    session.endSession();
    throw err;
  }
}

// ---------------------------
// manualRun - wrapper for admin manual trigger
// ---------------------------
async function manualRun(period, adminId) {
  return distributeMonthlyRoyalty({ period, performedBy: adminId });
}

// ---------------------------
// getUserRoyaltySummary(userId)
// returns user cumulative percent, lifetime royalty, starRoyaltyEarned
// ---------------------------
async function getUserRoyaltySummary(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw new Error('User not found');

  const wallet = await Wallet.findOne({ userId: user._id }).lean();

  const percent = user.rank ? cumulativePercentForRank(user.rank) : 0;
  return {
    userId: user._id.toString(),
    rank: user.rank || null,
    cumulativePercent: percent,
    lifetimeRoyaltyIncome: wallet ? Number(wallet.royaltyIncome || 0) : 0,
    starRoyaltyEarned: Number(user.starRoyaltyEarned || 0)
  };
}

// ---------------------------
// rollbackDistribution(period)
// Admin-only: rollback all RoyaltyLedger entries for given period and reverse wallet increments
// Use cautiously.
// ---------------------------
async function rollbackDistribution(period) {
  if (!period) throw new Error('period required (YYYY-MM)');

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // find royalty ledger entries for period
    const entries = await RoyaltyLedger.find({ period }).session(session).lean();
    for (const e of entries) {
      // decrement wallet
      await Wallet.updateOne({ userId: e.userId }, { $inc: { balance: -Number(e.amount), royaltyIncome: -Number(e.amount) } }, { session });
    }

    // remove ledger entries
    await RoyaltyLedger.deleteMany({ period }).session(session);

    // NOTE: We DO NOT revert starRoyaltyEarned automatically because mapping which portion belonged to STAR is not stored separately.
    // If you need full rollback including starRoyaltyEarned, you must store starHandledAmount per ledger record (extension recommended).
    await session.commitTransaction();
    session.endSession();
    return { ok: true, rolledBack: entries.length };
  } catch (err) {
    await session.abortTransaction().catch(()=>{});
    session.endSession();
    throw err;
  }
}

// ---------------------------
// Exports
// ---------------------------
module.exports = {
  cumulativePercentForRank,
  computeRoyaltyForUser,
  distributeMonthlyRoyalty,
  manualRun,
  getUserRoyaltySummary,
  rollbackDistribution
};
