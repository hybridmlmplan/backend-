// backend/config/constants.js
/**
 * Master constants derived from the final business plan (8 sessions).
 * Use these constants across binaryEngine, sessionScheduler, royaltyEngine, fundEngine, etc.
 */

const PACKAGE_CONFIG = {
  silver: {
    code: "silver",
    displayName: "Silver",
    price: 35,
    pv: 35,
    pairIncome: 10,
    capPerSession: 1
  },
  gold: {
    code: "gold",
    displayName: "Gold",
    price: 155,
    pv: 155,
    pairIncome: 50,
    capPerSession: 1
  },
  ruby: {
    code: "ruby",
    displayName: "Ruby",
    price: 1250,
    pv: 1250,
    pairIncome: 500,
    capPerSession: 1
  }
};

const PACKAGES = Object.values(PACKAGE_CONFIG);

// Session schedule: 8 sessions per day, each 2h15m (times are local assumed server timezone)
const SESSIONS = [
  { id: 1, start: "06:00", end: "08:15" },
  { id: 2, start: "08:15", end: "10:30" },
  { id: 3, start: "10:30", end: "12:45" },
  { id: 4, start: "12:45", end: "15:00" },
  { id: 5, start: "15:00", end: "17:15" },
  { id: 6, start: "17:15", end: "19:30" },
  { id: 7, start: "19:30", end: "21:45" },
  { id: 8, start: "21:45", end: "00:00" }
];

const DAILY_SESSIONS = SESSIONS.length;
const SESSION_DURATION_MIN = 135; // 2 hours 15 minutes

// Rank income tables (pair income multipliers or direct values if needed)
// These are the "rank income" display/definition values from plan.
// If you need numeric multipliers for calculation use them accordingly.
const RANK_INCOME = {
  silver: { // ranks within Silver package
    Star: 10,
    SilverStar: 20,
    GoldStar: 40,
    RubyStar: 80,
    EmeraldStar: 160,
    DiamondStar: 320,
    CrownStar: 640,
    AmbassadorStar: 1280,
    CompanyStar: 2560
  },
  gold: {
    Star: 50,
    SilverStar: 100,
    GoldStar: 200,
    RubyStar: 400,
    EmeraldStar: 800,
    DiamondStar: 1600,
    CrownStar: 3200,
    AmbassadorStar: 6400,
    CompanyStar: 12800
  },
  ruby: {
    Star: 500,
    SilverStar: 1000,
    GoldStar: 2000,
    RubyStar: 4000,
    EmeraldStar: 8000,
    DiamondStar: 16000,
    CrownStar: 32000,
    AmbassadorStar: 64000,
    CompanyStar: 128000
  }
};

// Level BV income (levels 1..10 get 0.5% BV each)
const LEVEL_BV_PERCENT = 0.5; // percent per level (1..10)

// Level bonus (CTO BV) thresholds
const LEVEL_BONUSES = {
  star1: { directsRequired: 10, ctoPercent: 1.0 },
  star2: { secondLevelMembersRequired: 70, ctoPercent: 1.1 },
  star3: { thirdLevelMembersRequired: 200, ctoPercent: 1.2 }
};

// Royalty rules
// Special rule: For Silver ranks there is "3% until ₹35" — interpret as:
// - If payout amount <= 35 then apply 3% royalty (for base 'Star' rank), otherwise use rank percentages below.
// But here we expose both the base rule and rank-wise mapping so services can apply exact logic.
const ROYALTY_RULE = {
  silverBaseCapAmount: 35, // up to this amount apply special 3% for 'star' level case
  // rank-wise percentage mapping (final plan mapping you gave)
  rankPercent: {
    Star: 3,            // special: up to ₹35 -> 3% (plan note). Services must apply cap logic.
    SilverStar: 1,
    GoldStar: 2,
    RubyStar: 3,
    EmeraldStar: 4,
    DiamondStar: 5,
    CrownStar: 6,
    AmbassadorStar: 7,
    CompanyStar: 8
  },
  // Which package ranks get continuous royalty? (Plan: Only Silver ranks get continuous CTO royalty earlier,
  // but later you asked for rank-based royalty mapping — keep mapping generic and services will apply business rule)
  applicablePackages: ["silver", "gold", "ruby"] // services decide who actually gets paid
};

// Fund pools config
const FUND_POOLS = {
  carFund: { name: "carFund", monthlyPercentPool: 2, minRank: "RubyStar" },
  houseFund: { name: "houseFund", monthlyPercentPool: 2, minRank: "DiamondStar" },
  travelFund: { name: "travelFund", yearly: true, minRankNational: "RubyStar", minRankInternational: "DiamondStar" }
};

// Franchise defaults
const FRANCHISE = {
  referrerPercentBV: 1, // percent of BV to referrer
  holderMinPercentPrice: 5 // minimum percent of selling price for franchise holder
};

// EPIN config
const EPIN = {
  tokenOnLive: true, // toggle for live environment (admin can change)
  tokenOffTesting: false, // for testing
  transferUnlimited: true,
  neverExpire: true
};

// General system behavior flags
const SYSTEM_FLAGS = {
  noRenewal: true, // no package expiry / no renewal required
  infiniteCycles: true, // red/green cycles continue forever per plan
  binaryUsesPVOnly: true, // PV used only for binary income
  otherIncomeFromBV: true // royalty/rank/funds from BV (repurchase/products)
};

// DB collection names (use consistently)
const COLLECTIONS = {
  USERS: "users",
  BINARY: "binary",
  SESSION: "sessions",
  TRANSACTION: "transactions",
  WALLET: "wallets",
  BV_LEDGER: "bvledgers",
  FUND_POOL: "fundpools",
  EPIN: "epins",
  ROYALTY_LOG: "royaltylogs",
  RANKS: "ranks"
};

// small helper to get package config by code
function getPackageConfig(code) {
  return PACKAGE_CONFIG[code] || null;
}

// helper to get session by id
function getSessionById(id) {
  return SESSIONS.find((s) => s.id === Number(id)) || null;
}

export {
  PACKAGE_CONFIG,
  PACKAGES,
  SESSIONS,
  DAILY_SESSIONS,
  SESSION_DURATION_MIN,
  RANK_INCOME,
  LEVEL_BV_PERCENT,
  LEVEL_BONUSES,
  ROYALTY_RULE,
  FUND_POOLS,
  FRANCHISE,
  EPIN,
  SYSTEM_FLAGS,
  COLLECTIONS,
  getPackageConfig,
  getSessionById
};
