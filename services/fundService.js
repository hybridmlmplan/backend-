// ============================================================
// FUND SERVICE (CLEAN)
// ============================================================

import User from "../models/User.js";
import { FUND_PERCENT } from "../constants/fund.js";


// ============================================================
// UTILS
// ============================================================

// Apply TDS + Admin charges
const applyCharges = (amount) => {
  if (!amount || amount <= 0) return 0;

  const tds = (amount * 5) / 100;
  const admin = (amount * 5) / 100;

  const net = amount - (tds + admin);

  return net > 0 ? net : 0;
};


// ============================================================
// 1. PROCESS FUND INCOME
// ============================================================

export const processFundIncome = async (userId) => {
  try {
    // Step 1: Fetch user
    const user = await User.findOne({ userId });

    if (!user) {
      return { status: false, message: "User not found" };
    }

    // Step 2: Eligibility flags (defaults safe)
    const isRubyOrAbove = Boolean(user.rubyRankReached);
    const isDiamondOrAbove = Boolean(user.diamondRankReached);

    if (!isRubyOrAbove && !isDiamondOrAbove) {
      return { status: false, message: "User not eligible for any fund" };
    }

    // Step 3: Company CTO BV
    const BV = Number(user.companyCTOBV || 0);

    let carFund = 0;
    let houseFund = 0;

    // -------------------------------
    // CAR FUND (Ruby Star and above)
    // -------------------------------
    if (isRubyOrAbove) {
      const income = (BV * FUND_PERCENT.CAR) / 100;
      carFund = applyCharges(income);
    }

    // ----------------------------------
    // HOUSE FUND (Diamond Star and above)
    // ----------------------------------
    if (isDiamondOrAbove) {
      const income = (BV * FUND_PERCENT.HOUSE) / 100;
      houseFund = applyCharges(income);
    }

    const total = carFund + houseFund;

    // Step 4: Update wallet
    user.wallet = Number(user.wallet || 0) + total;

    // Step 5: Update stats safely
    user.fundStats = {
      carFund: (user.fundStats?.carFund || 0) + carFund,
      houseFund: (user.fundStats?.houseFund || 0) + houseFund,
      totalFundIncome: (user.fundStats?.totalFundIncome || 0) + total,
      lastPayoutDate: new Date(),
    };

    // Step 6: Save
    await user.save();

    return {
      status: true,
      message: "Fund processed",
      fundIncome: {
        carFund,
        houseFund,
        total,
      },
    };
  } catch (error) {
    return {
      status: false,
      message: "Server error",
      error: error?.message,
    };
  }
};



// ============================================================
// 2. GET USER FUND SUMMARY
// ============================================================

export const getUserFundSummary = async (userId) => {
  try {
    const user = await User.findOne({ userId });

    if (!user) {
      return {
        carFund: 0,
        houseFund: 0,
        totalFundIncome: 0,
        lastPayoutDate: null,
      };
    }

    return user.fundStats || {
      carFund: 0,
      houseFund: 0,
      totalFundIncome: 0,
      lastPayoutDate: null,
    };
  } catch {
    return {
      carFund: 0,
      houseFund: 0,
      totalFundIncome: 0,
      lastPayoutDate: null,
    };
  }
};



// ============================================================
// OPTIONAL DEFAULT EXPORT
// ============================================================

export default {
  processFundIncome,
  getUserFundSummary,
};

// ============================================================
// END OF FILE
// ============================================================
