// ============================
// HYBRID MLM LEVEL CONSTANTS
// ============================

// ---------------------------------------------------
// 1) PACKAGE CONFIGURATIONS
// ---------------------------------------------------

export const PACKAGES = {
  SILVER: {
    name: "Silver",
    prefix: "Sp",
    joiningPV: 35,
    pairIncome: 10,
    sessionCapping: 4, // first rank only
  },

  GOLD: {
    name: "Gold",
    prefix: "Gp",
    joiningPV: 155,
    pairIncome: 50,
    sessionCapping: 1,
  },

  RUBY: {
    name: "Ruby",
    prefix: "Rp",
    joiningPV: 1250,
    pairIncome: 500,
    sessionCapping: 1,
  },
};

// ---------------------------------------------------
// 2) RANK UPGRADE RULES
// ---------------------------------------------------

// Every rank upgrade = total 8 pairs
// 4 Income + 4 Cutoff

export const PAIR_REQUIREMENT = 8;
export const PAIR_INCOME = 4;
export const PAIR_CUTOFF = 4;

// Sessions
export const SESSIONS = {
  MORNING: { start: "06:00", end: "16:00" },
  EVENING: { start: "16:01", end: "23:59" },
};

// ---------------------------------------------------
// 3) SILVER PACKAGE RANK INCOME (per pair)
// ---------------------------------------------------

export const SILVER_RANKS = [
  { rank: "Sp Star", income: 10, royalty: 0 },
  { rank: "Sp Silver Star", income: 20, royalty: 1 },
  { rank: "Sp Gold Star", income: 40, royalty: 2 },
  { rank: "Sp Ruby Star", income: 80, royalty: 3 },
  { rank: "Sp Emerald Star", income: 160, royalty: 4 },
  { rank: "Sp Diamond Star", income: 320, royalty: 5 },
  { rank: "Sp Crown Star", income: 640, royalty: 6 },
  { rank: "Sp Ambassador Star", income: 1280, royalty: 7 },
  { rank: "Sp Company Star", income: 2560, royalty: 8 },
];

// NOTE:
// Silver first rank = session capping 4 pairs
// Next ranks = session capping 1 pair

// ---------------------------------------------------
// 4) GOLD PACKAGE RANK INCOME
// ---------------------------------------------------

export const GOLD_RANKS = [
  { rank: "Gp Star", income: 50 },
  { rank: "Gp Silver Star", income: 100 },
  { rank: "Gp Gold Star", income: 200 },
  { rank: "Gp Ruby Star", income: 400 },
  { rank: "Gp Emerald Star", income: 800 },
  { rank: "Gp Diamond Star", income: 1600 },
  { rank: "Gp Crown Star", income: 3200 },
  { rank: "Gp Ambassador Star", income: 6400 },
  { rank: "Gp Company Star", income: 12800 },
];

// ---------------------------------------------------
// 5) RUBY PACKAGE RANK INCOME
// ---------------------------------------------------

export const RUBY_RANKS = [
  { rank: "Rp Star", income: 500 },
  { rank: "Rp Silver Star", income: 1000 },
  { rank: "Rp Gold Star", income: 2000 },
  { rank: "Rp Ruby Star", income: 4000 },
  { rank: "Rp Emerald Star", income: 8000 },
  { rank: "Rp Diamond Star", income: 16000 },
  { rank: "Rp Crown Star", income: 32000 },
  { rank: "Rp Ambassador Star", income: 64000 },
  { rank: "Rp Company Star", income: 128000 },
];

// ---------------------------------------------------
// 6) ROYALTY STRUCTURE (Only Silver Package)
// ---------------------------------------------------

export const ROYALTY = {
  until35: 3, // Only until ₹35 earn hota hai
  ranks: {
    SpSilverStar: 1,
    SpGoldStar: 2,
    SpRubyStar: 3,
    SpEmeraldStar: 4,
    SpDiamondStar: 5,
    SpCrownStar: 6,
    SpAmbassadorStar: 7,
    SpCompanyStar: 8,
  },
};

// ---------------------------------------------------
// 7) LEVEL INCOME STRUCTURE (BV Based)
// ---------------------------------------------------

// Level 1–3 Progressive CTO BV
export const LEVEL_INCOME = {
  level1: 1,   // 10 directs → 1%
  level2: 1.1, // 70 members
  level3: 1.2, // 200 members

  // Level 4–10 fixed
  others: 0.5, // 0.5% each
};

// ---------------------------------------------------
// 8) FUNDS ELIGIBILITY
// ---------------------------------------------------

export const FUNDS = {
  carFund: {
    rankEligible: "Rp Star",
    percent: 2, // 2% CTO BV
  },

  houseFund: {
    rankEligible: "Rp Diamond Star",
    percent: 2, // 2% CTO BV
  },
};

// ---------------------------------------------------
// 9) INTERNATIONAL/NATIONAL TOUR
// ---------------------------------------------------

export const TRAVEL = {
  national: "Ruby and above",
  international: "Diamond and above",
};

// ---------------------------------------------------
// 10) PV CONFIGURATION
// ---------------------------------------------------

export const PV = {
  yearlyTarget: 1440,
  allowShift: true,
};

// ---------------------------------------------------
// 11) STATIC RULES
// ---------------------------------------------------

export const RULES = {
  renewalDateSameForAllPackages: true,
  epinNoExpire: true,
  epinFreeTransfer: true,
  feb29Holiday: true,
  tds: 5,
  admin: 5,
};

// ---------------------------------------------------
// 12) HELPER FUNCTIONS
// ---------------------------------------------------

export const getRankIncome = (packageType, rankIndex) => {
  switch (packageType) {
    case "SILVER":
      return SILVER_RANKS[rankIndex]?.income || 0;
    case "GOLD":
      return GOLD_RANKS[rankIndex]?.income || 0;
    case "RUBY":
      return RUBY_RANKS[rankIndex]?.income || 0;
    default:
      return 0;
  }
};

export const getRoyaltyPercent = (rankName) => {
  return ROYALTY.ranks[rankName] || 0;
};

