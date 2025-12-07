// ==================================================
// FUND SERVICE (CAR / HOUSE / NOMINEE FUND)
// ==================================================

import User from "../models/User.js";
import {
  FUND_RATES,
  NOMINEE_CAP,
  applyDeduction,
} from "../constants/fund.js";


// ==================================================
// GET USER RANK (UTILITY)
// ==================================================
const getUserRank = (user) => {
  return user.rank || "STAR";
};


// ==================================================
// GENERIC FUND DISTRIBUTION FUNCTION
// ==================================================
//
// fundType: "car" | "house"
// CTO_BV: company total BV
//
// RULES:
// Car fund: 2% CTO BV (Ruby Star & above)
// House fund: 2% CTO BV (Diamond Star & above)
//

export const distributeFund = async (fundType, CTO_BV) => {
  try {
    const rate = FUND_RATES[fundType];

    if (!rate) {
      return { status: false, message: "Invalid fund type" };
    }

    // --------------------------------------------------
    // 1. Eligible users fetch karo
    // --------------------------------------------------

    let eligibleUsers = [];

    if (fundType === "car") {
      eligibleUsers = await User.find({
        rankLevel: { $gte: rate.minRank },
      });
    }

    if (fundType === "house") {
      eligibleUsers = await User.find({
        rankLevel: { $gte: rate.minRank },
      });
    }

    if (!eligibleUsers.length) {
      return { status: true, totalUsers: 0, message: "No eligible users" };
    }

    // --------------------------------------------------
    // 2. Total distributable amount
    // --------------------------------------------------

    const totalFund = CTO_BV * rate.percentage;

    const perUserRaw = totalFund / eligibleUsers.length;

    // --------------------------------------------------
    // 3. Apply deduction & update wallet
    // --------------------------------------------------

    for (const user of eligibleUsers) {
      const payable = applyDeduction(perUserRaw);

      user.wallet = (user.wallet || 0) + payable;
      await user.save();
    }

    return {
      status: true,
      fundType,
      eligibleUsers: eligibleUsers.length,
      perUserRaw,
      perUserPayable: applyDeduction(perUserRaw),
    };

  } catch (err) {
    console.log("Fund Error:", err);
    return { status: false, message: "Server error" };
  }
};




// ==================================================
// NOMINEE FUND (RUBY)
// ==================================================
//
// 1% CTO BV
// Monthly capping: 10,000
// All nominees share equally
//

export const distributeNomineeFund = async (CTO_BV) => {
  try {
    const users = await User.find({ isNominee: true });

    if (!users.length) {
      return { status: true, totalUsers: 0, message: "No nominees" };
    }

    // ------------------------------------
    // Total distributable amount
    // ------------------------------------

    const totalFund = CTO_BV * NOMINEE_CAP.percentage;

    const perUserRaw = totalFund / users.length;

    // ------------------------------------
    // Respect monthly capping (10,000)
    // ------------------------------------

    let perUserFinal = perUserRaw;

    if (perUserFinal > NOMINEE_CAP.maxMonthly) {
      perUserFinal = NOMINEE_CAP.maxMonthly;
    }

    // Apply 10% deduction
    const payable = applyDeduction(perUserFinal);

    // ------------------------------------
    // UPDATE WALLET
    // ------------------------------------

    for (const user of users) {
      user.wallet = (user.wallet || 0) + payable;
      await user.save();
    }

    return {
      status: true,
      nomineeUsers: users.length,
      perUserRaw,
      perUserFinal,
      perUserPayable: payable,
    };

  } catch (err) {
    console.log("Nominee Fund Error:", err);
    return { status: false, message: "Server error" };
  }
};
