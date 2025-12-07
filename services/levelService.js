// ==================================================
// LEVEL SERVICE (CALCULATE LEVEL INCOME)
// ==================================================

import User from "../models/User.js";
import {
  LEVEL_RATES,
  LEVEL_PROGRESSIVE_RATES,
  STAR_RANKS,
} from "../constants/levels.js";

import { applyDeduction } from "../constants/fund.js";


// ==================================================
// GET USER RANK (UTILITY)
// ==================================================
const getUserRank = (user) => {
  return user.rank || "STAR";
};


// ==================================================
// CALCULATE LEVEL INCOME FOR A SINGLE USER
// ==================================================
//
// CTO_BV: company total BV for distribution
// userId: target user
//
// RULES:
// 1. 1–3 levels = progressive % on CTO BV
// 2. Levels 1–10 = fixed 0.5% each user BV
// 3. Deduction apply: 10%
//

export const calculateLevelIncome = async (userId, CTO_BV) => {
  try {
    const user = await User.findById(userId);

    if (!user) return { status: false, message: "User not found" };

    // ---------- RESULTS CONTAINER ----------
    let totalIncome = 0;
    let details = [];

    // ==================================================
    // 1. PROGRESSIVE LEVEL INCOME (LEVEL 1–3)
    // ==================================================
    // Applies only if user rank is >= specific thresholds

    Object.keys(LEVEL_PROGRESSIVE_RATES).forEach((level) => {
      const rule = LEVEL_PROGRESSIVE_RATES[level];

      if (user.totalDirect >= rule.minDirect) {
        const raw = CTO_BV * rule.rate;
        const payable = applyDeduction(raw);

        totalIncome += payable;

        details.push({
          type: "progressive",
          level: level,
          raw,
          payable,
        });
      }
    });

    // ==================================================
    // 2. FIXED LEVEL INCOME (LEVELS 1–10)
    // ==================================================
    //
    // 0.5% CTO BV per level achived
    // No dependency on members
    //

    Object.keys(LEVEL_RATES).forEach((level) => {
      const rate = LEVEL_RATES[level];

      const raw = CTO_BV * rate;
      const payable = applyDeduction(raw);

      totalIncome += payable;

      details.push({
        type: "fixed",
        level,
        raw,
        payable,
      });
    });

    // --------------------------------------------------
    // UPDATE USER WALLET
    // --------------------------------------------------

    user.wallet = (user.wallet || 0) + totalIncome;
    await user.save();

    return {
      status: true,
      totalIncome,
      details,
      rank: getUserRank(user),
    };

  } catch (err) {
    console.log("Level Income Error:", err);
    return { status: false, message: "Server error" };
  }
};
