// =============================================
// FUND CONSTANTS (CAR / HOUSE / TRAVEL FUNDS)
// =============================================

// ---------------------------------------------
// GLOBAL CHARGES (TDS + ADMIN)
// ---------------------------------------------
export const GLOBAL_CHARGES = {
  TDS: 0.05,           // 5%
  ADMIN: 0.05,         // 5%
  DEDUCTION: 0.10      // total 10% deduction
};

// ---------------------------------------------
// FUNDS BASED ON CTO BV
// ---------------------------------------------
//
// 2% Car Fund: Ruby Star and above
// 2% House Fund: Diamond Star and above
//
// NOTE: These funds will be distributed from
// company CTO BV after charges deduction.
//

export const FUND_RATES = {
  CAR_FUND: 0.02,    // 2% CTO BV
  HOUSE_FUND: 0.02   // 2% CTO BV
};

// ---------------------------------------------
// MIN RANKS TO ELIGIBLE
// ---------------------------------------------
//
// Car Fund Eligible: Ruby Star and above
// House Fund Eligible: Diamond Star and above
//

export const FUND_RANK_ELIGIBILITY = {
  CAR_FUND_MIN_RANK: "RUBY_STAR",
  HOUSE_FUND_MIN_RANK: "DIAMOND_STAR"
};

// ---------------------------------------------
// TRAVEL FUND RULES
// ---------------------------------------------
//
// Ruby & above: National Tour
// Diamond & above: International Tour
//

export const TRAVEL_FUND = {
  NATIONAL_MIN_RANK: "RUBY_STAR",
  INTERNATIONAL_MIN_RANK: "DIAMOND_STAR"
};

// ---------------------------------------------
// UTILS: DEDUCTION CALCULATION
// ---------------------------------------------

export const applyDeduction = (amount) => {
  const after = amount - (amount * GLOBAL_CHARGES.DEDUCTION);
  return Math.max(after, 0);
};
