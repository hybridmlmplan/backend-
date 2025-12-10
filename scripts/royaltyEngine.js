// backend/scripts/royaltyEngine.js
// Royalty engine — FINAL plan implementation (updated royalty table)
// - Royalty only for active users with package 'silver'.
// - If user's totalRoyaltyReceived < 35 => rate = 3% (star-cap).
// - Otherwise rank-based percent:
//   silver_star:1%, gold_star:2%, ruby_star:3%, emerald_star:4%,
//   diamond_star:5%, crown_star:6%, ambassador_star:7%, company_star:8%.
// - Source of funds: FundPool.totalBV (CTO BV). Atomic transactions.
// - If desired total > available pool, scale payouts proportionally.

import mongoose from "mongoose";
import FundPool from "../models/FundPool.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import Transaction from "../models/Transaction.js";
import RoyaltyLog from "../models/RoyaltyLog.js";

const SAFE_MIN = 0.000001;

// Final rank-based royalty mapping (after star cap)
const RANK_ROYALTY_PCT = {
  silver_star: 0.01,
  gold_star: 0.02,
  ruby_star: 0.03,
  emerald_star: 0.04,
  diamond_star: 0.05,
  crown_star: 0.06,
  ambassador_star: 0.07,
  company_star: 0.08
};

// Helper: choose rate for a user based on totalRoyaltyReceived and rank
function chooseRateForUser(user) {
  const totalReceived = (user.totalRoyaltyReceived || 0);
  if (totalReceived < 35) return 0.03; // star-cap phase
  const rk = user.rank || "silver_star"; // default if missing
  return RANK_ROYALTY_PCT[rk] || 0.01;
}

/**
 * distributeRoyalty
 * Distribute `ctoBVAmount` among eligible Silver-package users.
 *
 * @param {Number} ctoBVAmount - amount from which royalty is computed (company CTO BV base)
 * @param {Object} opts - { minPayout: Number (min per user), limitUsers: Number, prioritizeCapFirst: Boolean }
 *
 * Strategy:
 * 1. Load eligible users (packageCode='silver', isActivePackage=true).
 * 2. Compute desired payout per user = ctoBVAmount * rate (rate chosen by chooseRateForUser).
 * 3. If sum(desired) <= availablePool -> pay desired for each.
 *    Else scale all payouts proportionally so total == availablePool.
 *
 * Returns: { status, totalDistributed, recipients: [{ userId, rate, desired, paid }] }
 */
export async function distributeRoyalty(ctoBVAmount, opts = {}) {
  if (!ctoBVAmount || typeof ctoBVAmount !== "number" || ctoBVAmount <= SAFE_MIN) {
    return { status: false, message: "invalid ctoBVAmount" };
  }

  const minPayout = typeof opts.minPayout === "number" ? opts.minPayout : 0;
  const limitUsers = typeof opts.limitUsers === "number" ? opts.limitUsers : null;

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // fetch and lock FundPool
    const pool = await FundPool.findOne({}, null, { session });
    const available = pool ? (pool.totalBV || 0) : 0;
    if (available <= SAFE_MIN) {
      await session.abortTransaction();
      session.endSession();
      return { status: false, message: "No CTO BV available in FundPool" };
    }

    // get eligible users (silver package, active)
    // prioritize users with lowest totalRoyaltyReceived so cap-phase users get earlier consideration
    let q = User.find({ packageCode: "silver", isActivePackage: true }).sort({ totalRoyaltyReceived: 1 }).session(session);
    if (limitUsers) q = q.limit(limitUsers);
    const users = await q.lean();

    if (!users || users.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return { status: true, totalDistributed: 0, recipients: [] };
    }

    // compute desired payouts
    const recipients = [];
    let sumDesired = 0;
    for (const u of users) {
      const rate = chooseRateForUser(u);
      const desired = +(ctoBVAmount * rate).toFixed(2);
      if (desired < minPayout) {
        recipients.push({ userId: u._id.toString(), rate, desired, paid: 0, reason: "below_min" });
        continue;
      }
      recipients.push({ userId: u._id.toString(), rate, desired, paid: 0 });
      sumDesired += desired;
    }

    // If nothing desirable
    if (sumDesired <= SAFE_MIN) {
      await session.abortTransaction();
      session.endSession();
      return { status: true, totalDistributed: 0, recipients };
    }

    // Determine scaling factor if desired > available
    const toDistribute = Math.min(sumDesired, available, ctoBVAmount); // ensure logical cap
    const scale = sumDesired > toDistribute ? toDistribute / sumDesired : 1;

    // Perform payouts
    let totalDistributed = 0;
    for (const r of recipients) {
      if (!r.desired || r.desired < minPayout) continue;
      const paid = +((r.desired * scale).toFixed(2));
      if (paid <= SAFE_MIN) continue;

      // wallet + transaction + royalty log
      await Wallet.findOneAndUpdate({ user: r.userId }, { $inc: { balance: paid } }, { upsert: true, new: true, session });

      await Transaction.create(
        [
          {
            user: r.userId,
            type: "royalty",
            amount: paid,
            meta: { source: "CTO_BV", ctoBVBase: ctoBVAmount, rate: r.rate },
            createdAt: new Date()
          }
        ],
        { session }
      );

      await RoyaltyLog.create(
        [
          {
            user: r.userId,
            amount: paid,
            rate: r.rate,
            rank: undefined, // optional: could load rank if needed
            ctoBVBase: ctoBVAmount,
            createdAt: new Date()
          }
        ],
        { session }
      );

      // update user's cumulative royalty counter
      await User.updateOne({ _id: r.userId }, { $inc: { totalRoyaltyReceived: paid } }, { session });

      r.paid = paid;
      totalDistributed += paid;
    }

    // Deduct distributed amount from FundPool.totalBV
    const newTotal = Math.max(0, (pool.totalBV || 0) - totalDistributed);
    await FundPool.updateOne({}, { $set: { totalBV: newTotal, updatedAt: new Date() } }, { session });

    await session.commitTransaction();
    session.endSession();

    return { status: true, totalDistributed: +totalDistributed.toFixed(2), recipients: recipients.filter(r => r.paid > 0) };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("distributeRoyalty ERROR:", err);
    return { status: false, error: err.message };
  }
}

export default { distributeRoyalty };
