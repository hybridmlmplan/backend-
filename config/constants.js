// config/constants.js

// Packages config (codes match earlier usage)
export const PACKAGES = {
  SILVER: { code: "silver", name: "Silver", price: 35, pv: 35, pairIncome: 10, prefix: "Sp" },
  GOLD:   { code: "gold",   name: "Gold",   price: 155, pv: 155, pairIncome: 50, prefix: "Gp" },
  RUBY:   { code: "ruby",   name: "Ruby",   price: 1250, pv: 1250, pairIncome: 500, prefix: "Rp" }
};

// Rank incomes (per-level) — numeric arrays for levels 0..8
export const RANK_INCOME = {
  silver: [10,20,40,80,160,320,640,1280,2560],
  gold:   [50,100,200,400,800,1600,3200,6400,12800],
  ruby:   [500,1000,2000,4000,8000,16000,32000,64000,128000]
};

// Royalty (silver only) initial thresholds/percent mapping (levels 0..8)
export const ROYALTY_PERCENT_SILVER = [3,1,2,3,4,5,6,7,8]; // as provided

// Fund percents (example; change in fundService if needed)
export const FUND_PERCENTS = {
  car: 0.02,   // 2% of CTO BV (user requested car fund 2% for Ruby Star and above)
  house: 0.02, // 2% for Diamond Star and above
  // travel fund handled separately
};

// Level income settings
export const LEVEL_INCOME = {
  percentPerLevel: 0.5, // 0.5% per level
  maxLevels: 10
};

// Session timings (8 sessions/day, each 2h15m)
export const SESSIONS = [
  { number: 1, start: "06:00", end: "08:15" },
  { number: 2, start: "08:15", end: "10:30" },
  { number: 3, start: "10:30", end: "12:45" },
  { number: 4, start: "12:45", end: "15:00" },
  { number: 5, start: "15:00", end: "17:15" },
  { number: 6, start: "17:15", end: "19:30" },
  { number: 7, start: "19:30", end: "21:45" },
  { number: 8, start: "21:45", end: "00:00" }
];

// Session helper: compute current session from hours (0-23)
export function getSessionNumberForHour(hour) {
  if (hour >= 6 && hour < 8.25) return 1;
  if (hour >= 8.25 && hour < 10.5) return 2;
  if (hour >= 10.5 && hour < 12.75) return 3;
  if (hour >= 12.75 && hour < 15) return 4;
  if (hour >= 15 && hour < 17.25) return 5;
  if (hour >= 17.25 && hour < 19.5) return 6;
  if (hour >= 19.5 && hour < 21.75) return 7;
  // 21.75..24 and 0..6 => session 8 for 21:45-00:00, others handled as session 1 early morning
  if (hour >= 21.75 || hour < 6) return 8;
  return 1;
}

// Export default
export default {
  PACKAGES,
  RANK_INCOME,
  ROYALTY_PERCENT_SILVER,
  FUND_PERCENTS,
  LEVEL_INCOME,
  SESSIONS,
  getSessionNumberForHour
};
