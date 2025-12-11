/**
 * services/levelService.js
 *
 * Level income & Level-Star bonuses service for Hybrid MLM Plan (Dev ji)
 *
 * Exports:
 *   - distributeLevelIncome({ buyerUserId, bv, credit })   // credit 0.5% BV to uplines level 1..10
 *   - distributeLevelStarBonus({ userId, ctoBv, credit })  // credit Star1/2/3 bonuses if eligible
 *   - getUplines(userId, levels)                           // returns array of upline user docs/ids
 *   - getLevelCounts(userId, depth = 3)                    // returns counts for level1..level3
 *
 * Usage:
 *   import LevelService from "../services/levelService.js";
 *   await LevelService.distributeLevelIncome({ buyerUserId, bv, credit: walletService.credit });
 *   await LevelService.distributeLevelStarBonus({ userId, ctoBv, credit: walletService.credit });
 *
 * Notes:
 *   - credit(userId, amount, type, meta) is the recommended callback to pass.
 *   - If credit is not passed, this module will try to use walletService.credit if available.
 *   - User model must have: userId (string), sponsorId (string|null).
 */

import User from "../models/User.js";
import * as walletService from "../services/walletService.js"; // optional fallback
import PVBVLedger from "../models/PVBVLedger.js"; // optional fallback ledger
import mongoose from "mongoose";

const LEVEL_PERCENT = 0.005; // 0.5% => 0.005
const MAX_LEVELS = 10;

// Level-Star bonus thresholds & percents
const LEVEL_STAR_RULES = {
  star1: { level: 1, threshold: 10, percent: 0.01 },   // 10 directs in level-1 => 1% of CTO BV
  star2: { level: 2, threshold: 70, percent: 0.011 },  // 70 in level-2 => 1.1% of CTO BV
  star3: { level: 3, threshold: 200, percent: 0.012 }  // 200 in level-3 => 1.2% of CTO BV
};

// Helper: safe credit wrapper
async function safeCredit(userId, amount, type = "level_income", meta = {}, creditCallback = null) {
  if (!userId || !amount || amount <= 0) return false;

  // use provided callback first
  if (typeof creditCallback === "function") {
    await creditCallback(userId, amount, type, meta);
    return true;
  }

  // fallback to walletService.credit if available
  if (walletService && typeof walletService.credit === "function") {
    await walletService.credit(userId, amount, type, meta);
    return true;
  }

  // fallback to ledger entry if available
  if (PVBVLedger) {
    await PVBVLedger.create({
      user: mongoose.Types.ObjectId(userId),
      bv: 0,
      pv: 0,
      cash: amount,
      type,
      meta,
      createdAt: new Date(),
    });
    return true;
  }

  throw new Error("No credit mechanism available (provide credit callback or implement walletService.credit)");
}

/**
 * Get uplines (sponsor chain) for a user up to `levels`.
 * Returns array of user documents (length up to `levels`) in order: level1 (direct sponsor), level2, ...
 *
 * Implementation notes:
 * - Uses `user.sponsorId` chain. sponsorId is expected to be the sponsor's userId (string).
 * - If your schema stores Mongo ObjectId references, adapt find accordingly.
 */
export async function getUplines(userId, levels = MAX_LEVELS) {
  if (!userId) return [];

  const uplines = [];
  try {
    // find starting user
    let current = await User.findOne({ userId }).select("sponsorId").lean();
    if (!current) return [];

    let depth = 0;
    while (current && current.sponsorId && depth < levels) {
      const sponsorUser = await User.findOne({ userId: current.sponsorId }).select("userId sponsorId name _id").lean();
      if (!sponsorUser) break;
      uplines.push(sponsorUser);
      current = sponsorUser;
      depth += 1;
    }
  } catch (e) {
    console.error("getUplines error:", e.message);
  }
  return uplines;
}

/**
 * Get counts of members in level-1, level-2, level-3 for a given user.
 * Returns: { level1: n1, level2: n2, level3: n3 }
 *
 * Implementation approach:
 *  - Level 1: users whose sponsorId == userId
 *  - Level 2: users whose sponsor's sponsor == userId
 *  - Level 3: two-level BFS limited traversal
 *
 * This uses DB queries optimized to avoid scanning entire collection where possible.
 */
export async function getLevelCounts(userId, depth = 3) {
  const result = { level1: 0, level2: 0, level3: 0 };
  if (!userId) return result;

  // Level-1
  try {
    const level1Users = await User.find({ sponsorId: userId }).select("userId").lean();
    result.level1 = Array.isArray(level1Users) ? level1Users.length : 0;

    if (depth >= 2) {
      // Level-2: get sponsors of level1 users
      const level1Ids = level1Users.map((u) => u.userId);
      if (level1Ids.length > 0) {
        const level2Users = await User.find({ sponsorId: { $in: level1Ids } }).select("userId").lean();
        result.level2 = Array.isArray(level2Users) ? level2Users.length : 0;

        if (depth >= 3) {
          const level2Ids = level2Users.map((u) => u.userId);
          if (level2Ids.length > 0) {
            const level3Users = await User.find({ sponsorId: { $in: level2Ids } }).select("userId").lean();
            result.level3 = Array.isArray(level3Users) ? level3Users.length : 0;
          } else {
            result.level3 = 0;
          }
        }
      } else {
        result.level2 = 0;
        result.level3 = 0;
      }
    }
  } catch (e) {
    console.error("getLevelCounts error:", e.message);
  }

  return result;
}

/**
 * distributeLevelIncome
 *
 * For a BV credit event (eg. repurchase / franchise sale), distribute 0.5% BV to uplines level 1..10.
 *
 * Params:
 *   - buyerUserId (string): the user who generated BV (downline)
 *   - bv (number): BV amount to use as base
 *   - credit (function) [optional]: async (userId, amount, type, meta) => {}
 *       If not provided, this service will attempt walletService.credit fallback.
 *   - meta (object) [optional]: extra meta forwarded to credit
 *
 * Returns: { distributed: [{ userId, level, amount }], skipped: [...] }
 */
export async function distributeLevelIncome({ buyerUserId, bv, credit = null, meta = {} }) {
  if (!buyerUserId) throw new Error("buyerUserId required");
  if (!bv || bv <= 0) return { distributed: [], skipped: [] };

  const uplines = await getUplines(buyerUserId, MAX_LEVELS); // array of sponsor user docs
  const distributed = [];
  const skipped = [];

  for (let i = 0; i < uplines.length; i += 1) {
    const upline = uplines[i];
    const level = i + 1; // i=0 => level1
    if (level > MAX_LEVELS) break;

    try {
      const amount = Number((bv * LEVEL_PERCENT).toFixed(4)); // maintain precision
      if (amount <= 0) {
        skipped.push({ userId: upline.userId, level, reason: "zero_amount" });
        continue;
      }

      // credit: type 'level_income'
      await safeCredit(upline._id || upline.userId, amount, "level_income", { fromUser: buyerUserId, level, ...meta }, credit);

      distributed.push({ userId: upline.userId || (upline._id && upline._id.toString()), level, amount });
    } catch (e) {
      console.error(`distributeLevelIncome: failed to credit level ${i + 1} upline ${upline.userId}:`, e.message);
      skipped.push({ userId: upline.userId, level, reason: e.message });
    }
  }

  return { distributed, skipped };
}

/**
 * distributeLevelStarBonus
 *
 * Check user's first/second/third-level counts and credit CTO BV % if eligible.
 *
 * Params:
 *   - userId (string)   : user to check
 *   - ctoBv (number)    : company total output BV (must be provided)
 *   - credit (function) [optional]: async (userId, amount, type, meta) => {}
 *
 * Returns:
 *   { credited: [{ tier, percent, amount }], skipped: [{ tier, reason }] }
 */
export async function distributeLevelStarBonus({ userId, ctoBv, credit = null, meta = {} }) {
  if (!userId) throw new Error("userId required");
  if (!ctoBv || ctoBv <= 0) {
    return { credited: [], skipped: [{ tier: "all", reason: "invalid_ctoBv" }] };
  }

  const counts = await getLevelCounts(userId, 3);
  const credited = [];
  const skipped = [];

  // Star1
  try {
    const rule1 = LEVEL_STAR_RULES.star1;
    if (counts.level1 >= rule1.threshold) {
      const amount = Number((ctoBv * rule1.percent).toFixed(4));
      await safeCredit(userId, amount, "level_star_bonus", { tier: "star1", ctoBv, ...meta }, credit);
      credited.push({ tier: "star1", percent: rule1.percent, amount });
    } else {
      skipped.push({ tier: "star1", reason: `needs ${rule1.threshold} level1; found ${counts.level1}` });
    }
  } catch (e) {
    console.error("distributeLevelStarBonus star1 error:", e.message);
    skipped.push({ tier: "star1", reason: e.message });
  }

  // Star2
  try {
    const rule2 = LEVEL_STAR_RULES.star2;
    if (counts.level2 >= rule2.threshold) {
      const amount = Number((ctoBv * rule2.percent).toFixed(4));
      await safeCredit(userId, amount, "level_star_bonus", { tier: "star2", ctoBv, ...meta }, credit);
      credited.push({ tier: "star2", percent: rule2.percent, amount });
    } else {
      skipped.push({ tier: "star2", reason: `needs ${rule2.threshold} level2; found ${counts.level2}` });
    }
  } catch (e) {
    console.error("distributeLevelStarBonus star2 error:", e.message);
    skipped.push({ tier: "star2", reason: e.message });
  }

  // Star3
  try {
    const rule3 = LEVEL_STAR_RULES.star3;
    if (counts.level3 >= rule3.threshold) {
      const amount = Number((ctoBv * rule3.percent).toFixed(4));
      await safeCredit(userId, amount, "level_star_bonus", { tier: "star3", ctoBv, ...meta }, credit);
      credited.push({ tier: "star3", percent: rule3.percent, amount });
    } else {
      skipped.push({ tier: "star3", reason: `needs ${rule3.threshold} level3; found ${counts.level3}` });
    }
  } catch (e) {
    console.error("distributeLevelStarBonus star3 error:", e.message);
    skipped.push({ tier: "star3", reason: e.message });
  }

  return { credited, skipped, counts };
}

/**
 * Convenience: wrapper that both distributes level incomes to uplines (1..10)
 * and optionally tries to distribute level-star bonuses to the originator's uplines if admin triggered.
 *
 * Example usage in wallet/fund flow:
 *   await LevelService.handleBV({ buyerUserId, bv, ctoBv, credit: walletService.credit })
 */
export async function handleBV({ buyerUserId, bv, ctoBv = 0, credit = null, meta = {} }) {
  const res1 = await distributeLevelIncome({ buyerUserId, bv, credit, meta });
  // Optionally distribute star bonuses for uplines or for specific users (business decision).
  // Usually star bonuses are distributed by admin cron when CTO BV is known for cycle.
  return { levelIncome: res1 };
}

export default {
  getUplines,
  getLevelCounts,
  distributeLevelIncome,
  distributeLevelStarBonus,
  handleBV,
};
