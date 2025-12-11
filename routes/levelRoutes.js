// routes/levelRoutes.js
// Complete Level System Routes for your MLM Plan
// Includes:
// - 10-level BV income
// - Level Star 1 / Star 2 / Star 3 qualification
// - CTO BV bonus per star rank
// - BV ledger aggregation
// - Direct count, level count calculations

const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");

const User = require("../models/User");
const BVLedger = require("../models/BVLedger"); // BV from repurchase/products
const LevelIncome = require("../models/LevelIncome"); 
const Settings = require("../models/Settings");

// ====================================================
// Utility: Get direct referrals
// ====================================================
async function getDirects(userId) {
  return await User.find({ sponsorId: userId }).select("_id name");
}

// ====================================================
// Utility: Get nth-level downline users
// Level 1 = direct
// Level 2 = users under directs
// Level 3 = users under level-2
// ...
// Level 10 max
// ====================================================
async function getLevelUsers(userId, level) {
  let currentLevel = [userId];
  let downline = [];

  for (let l = 1; l <= level; l++) {
    const next = await User.find({ placementParent: { $in: currentLevel } }).select("_id");
    currentLevel = next.map(u => u._id);

    if (l === level) {
      downline = [...currentLevel];
    }
  }

  return downline;
}

// ====================================================
// Utility: Calculate BV Income For One User
// Levels 1–10: 0.5% BV
// ====================================================
async function calculateBVIncomeForUser(userId) {
  let totalIncome = 0;
  let breakdown = [];

  for (let level = 1; level <= 10; level++) {
    const levelUsers = await getLevelUsers(userId, level);

    if (levelUsers.length === 0) {
      breakdown.push({ level, users: 0, bv: 0, income: 0 });
      continue;
    }

    const levelBV = await BVLedger.aggregate([
      { $match: { userId: { $in: levelUsers } } },
      { $group: { _id: null, total: { $sum: "$bv" } } }
    ]);

    const bv = levelBV[0]?.total || 0;
    const income = bv * 0.005; // 0.5%

    totalIncome += income;

    breakdown.push({
      level,
      users: levelUsers.length,
      bv,
      income
    });
  }

  return { totalIncome, breakdown };
}

// ====================================================
// Utility: Check Star 1/2/3 Level Achievements
// Star 1 = 10 directs + Level 1 view
// Star 2 = 70 members in Level 2
// Star 3 = 200 members in Level 3
// ====================================================
async function checkStarLevels(userId) {
  const directs = await getDirects(userId);
  const directCount = directs.length;

  const level2 = await getLevelUsers(userId, 2);
  const level3 = await getLevelUsers(userId, 3);

  return {
    star1: directCount >= 10,
    star2: level2.length >= 70,
    star3: level3.length >= 200,
    directCount,
    level2Count: level2.length,
    level3Count: level3.length
  };
}

// ====================================================
// Utility: CTO BV Star Bonuses
// Star 1 = 1% CTO BV
// Star 2 = 1.1% CTO BV
// Star 3 = 1.2% CTO BV
// ====================================================
async function calculateCTOBonus(userId, starData) {
  const settings = await Settings.findOne({});
  const CTOBV = settings?.ctoBV || 0;

  let bonus = 0;
  let rate = 0;

  if (starData.star3) {
    rate = 0.012; // 1.2%
  } else if (starData.star2) {
    rate = 0.011; // 1.1%
  } else if (starData.star1) {
    rate = 0.01; // 1%
  } else {
    rate = 0;
  }

  bonus = CTOBV * rate;

  return { CTOBV, rate, bonus };
}

// ====================================================
// ROUTE: GET My Network Level Summary
// ====================================================
router.get("/summary", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // LEVEL INCOME
    const bvIncome = await calculateBVIncomeForUser(userId);

    // STAR ELIGIBILITY
    const starData = await checkStarLevels(userId);

    // CTO BONUS
    const cto = await calculateCTOBonus(userId, starData);

    return res.json({
      userId,
      levels: bvIncome.breakdown,
      totalLevelIncome: bvIncome.totalIncome,

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
        bonusAmount: cto.bonus
      }
    });

  } catch (err) {
    console.error("LEVEL SUMMARY ERROR:", err);
    return res.status(500).json({ error: "Server Error" });
  }
});

// ====================================================
// ROUTE: GET My Directs + Level Counts Quick View
// ====================================================
router.get("/quick-view", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const directs = await getDirects(userId);
    const level2 = await getLevelUsers(userId, 2);
    const level3 = await getLevelUsers(userId, 3);

    return res.json({
      directs: directs.length,
      level2: level2.length,
      level3: level3.length
    });

  } catch (err) {
    console.error("QUICK VIEW ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
