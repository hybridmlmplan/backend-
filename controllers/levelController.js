// controllers/levelController.js
// Level system controller (safe): calculates level BV incomes, star eligibility, CTO bonuses.
// DOES NOT perform any payout or wallet crediting — record-only operations allowed for admin.
// Uses Mongoose models: User, BVLedger, LevelIncome, Settings
//
// Exposed methods:
// - summary(req, res)         GET  /levels/summary        -> computes and returns breakdown & CTO bonus
// - quickView(req, res)       GET  /levels/quick-view     -> directs/level2/level3 counts
// - calcAndRecord(req, res)   POST /levels/calc-record   -> admin-only: compute & save LevelIncome (record-only)
// - history(req, res)         GET  /levels/history/:user  -> admin: list recorded level incomes
//
// Note: adapt model field names if your schema differs.

const mongoose = require('mongoose');
const { Types } = mongoose;
const User = require('../models/User');
const BVLedger = require('../models/BVLedger');
const LevelIncome = require('../models/LevelIncome');
const Settings = require('../models/Settings');

/**
 * Helper: get direct referrals (level 1)
 * @param {ObjectId|string} userId
 * @returns Array of user _id
 */
async function getDirectIds(userId) {
  const directs = await User.find({ sponsorId: userId }).select('_id').lean();
  return directs.map(d => d._id.toString());
}

/**
 * Helper: get nth-level user ids under a user using BFS up to that level
 * Level 1 = direct, Level 2 = children of directs, etc.
 * NOTE: This implementation issues queries per level; for very large orgs use aggregation / precomputed tree for performance.
 *
 * @param {string|ObjectId} userId
 * @param {number} level - 1..10
 * @returns Array of userIds (strings)
 */
async function getLevelUserIds(userId, level) {
  if (level < 1) return [];
  let current = [userId.toString()];
  let result = [];
  for (let l = 1; l <= level; l++) {
    // find users whose sponsorId is in current
    const docs = await User.find({ sponsorId: { $in: current } }).select('_id').lean();
    const ids = docs.map(d => d._id.toString());
    if (l === level) result = ids;
    current = ids;
    if (!current.length) break;
  }
  return result;
}

/**
 * Helper: sum BV for array of userIds from BVLedger
 * @param {Array<string>} userIds
 * @returns number totalBV
 */
async function sumBVForUsers(userIds) {
  if (!userIds || !userIds.length) return 0;
  const agg = await BVLedger.aggregate([
    { $match: { userId: { $in: userIds.map(id => Types.ObjectId(id)) } } },
    { $group: { _id: null, total: { $sum: '$bv' } } }
  ]);
  return agg[0]?.total || 0;
}

/**
 * Calculate level BV income breakdown for user: levels 1..10 each 0.5%
 * returns { totalIncome, breakdown: [{level, usersCount, totalBV, income}, ...] }
 */
async function calculateLevelBVIncome(userId) {
  const breakdown = [];
  let totalIncome = 0;

  for (let level = 1; level <= 10; level++) {
    const uids = await getLevelUserIds(userId, level);
    const usersCount = uids.length;
    const totalBV = usersCount ? await sumBVForUsers(uids) : 0;
    const income = totalBV * 0.005; // 0.5%
    breakdown.push({
      level,
      usersCount,
      totalBV: Number(totalBV || 0),
      income: Number(income || 0)
    });
    totalIncome += income;
  }

  return { totalIncome: Number(totalIncome || 0), breakdown };
}

/**
 * Star checks:
 * Star1: 10 directs (level 1)
 * Star2: 70 members in level 2
 * Star3: 200 members in level 3
 */
async function computeStarEligibility(userId) {
  const directs = await getDirectIds(userId);
  const directCount = directs.length;
  const level2 = await getLevelUserIds(userId, 2);
  const level3 = await getLevelUserIds(userId, 3);
  return {
    star1: directCount >= 10,
    star2: level2.length >= 70,
    star3: level3.length >= 200,
    directCount,
    level2Count: level2.length,
    level3Count: level3.length
  };
}

/**
 * CTO Bonus calculation using Settings.ctoBV
 * Star1: 1% ; Star2: 1.1% ; Star3: 1.2%
 */
async function calculateCTOBonus(starEligibility) {
  const settings = await Settings.findOne({}).lean();
  const CTOBV = Number(settings?.ctoBV || 0);
  let rate = 0;
  if (starEligibility.star3) rate = 0.012;
  else if (starEligibility.star2) rate = 0.011;
  else if (starEligibility.star1) rate = 0.01;
  const bonus = CTOBV * rate;
  return { CTOBV, rate, bonus: Number(bonus || 0) };
}

/* ==========================
   Controller methods
   ========================== */

module.exports = {
  /**
   * GET /levels/summary
   * Returns levels 1..10 breakdown, totalLevelIncome, star eligibility, cto bonus
   */
  summary: async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ ok: false, error: 'Unauthorized' });

      // compute level BV income
      const levelResult = await calculateLevelBVIncome(userId);

      // star eligibility
      const starData = await computeStarEligibility(userId);

      // CTO bonus
      const cto = await calculateCTOBonus(starData);

      return res.json({
        ok: true,
        userId,
        levels: levelResult.breakdown,
        totalLevelIncome: Number(levelResult.totalIncome.toFixed(2)),
        starLevels: {
          star1: starData.star1,
          star2: starData.star2,
          star3: starData.star3,
          directCount: starData.directCount,
          level2Count: starData.level2Count,
          level3Count: starData.level3Count
        },
        ctoBonus: {
          CTOBV: cto.CTOBV,
          bonusRate: cto.rate,
          bonusAmount: Number(cto.bonus.toFixed(2))
        }
      });
    } catch (err) {
      console.error('level.summary error', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  /**
   * GET /levels/quick-view
   * Quick counts: directs, level2, level3
   */
  quickView: async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ ok: false, error: 'Unauthorized' });

      const directs = await getDirectIds(userId);
      const lvl2 = await getLevelUserIds(userId, 2);
      const lvl3 = await getLevelUserIds(userId, 3);

      return res.json({
        ok: true,
        directs: directs.length,
        level2: lvl2.length,
        level3: lvl3.length
      });
    } catch (err) {
      console.error('level.quickView error', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  /**
   * POST /levels/calc-record
   * Admin-only: calculate level income and store as LevelIncome document (record-only, safe)
   * Body: { userId }  (if admin wants to calculate for a specific user)
   *
   * Note: This DOES NOT credit wallet. It only stores the computed breakdown for reporting/audit.
   */
  calcAndRecord: async (req, res) => {
    try {
      // require admin
      if (!req.admin) return res.status(403).json({ ok: false, error: 'Admin access required' });

      const targetUserId = req.body.userId || req.admin.id;
      const user = await User.findById(targetUserId).lean();
      if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

      const levelResult = await calculateLevelBVIncome(targetUserId);
      const starData = await computeStarEligibility(targetUserId);
      const cto = await calculateCTOBonus(starData);

      // record LevelIncome doc
      const doc = new LevelIncome({
        userId: Types.ObjectId(targetUserId),
        breakdown: levelResult.breakdown,
        totalIncome: Number(levelResult.totalIncome.toFixed(2)),
        starData,
        ctoBonus: { CTOBV: cto.CTOBV, rate: cto.rate, amount: Number(cto.bonus.toFixed(2)) },
        computedBy: req.admin.id,
        computedAt: new Date()
      });

      await doc.save();

      return res.json({ ok: true, recordedId: doc._id, totalIncome: doc.totalIncome });
    } catch (err) {
      console.error('level.calcAndRecord error', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  /**
   * GET /levels/history/:userId
   * Admin: list recorded LevelIncome documents for auditing
   */
  history: async (req, res) => {
    try {
      if (!req.admin) return res.status(403).json({ ok: false, error: 'Admin access required' });
      const uid = req.params.userId;
      if (!uid) return res.status(400).json({ ok: false, error: 'userId required' });

      const filter = {};
      if (Types.ObjectId.isValid(uid)) filter.userId = Types.ObjectId(uid);
      else filter.userId = uid; // support userId string if stored that way

      const docs = await LevelIncome.find(filter).sort({ computedAt: -1 }).limit(500).lean();
      return res.json({ ok: true, count: docs.length, records: docs });
    } catch (err) {
      console.error('level.history error', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  }
};
