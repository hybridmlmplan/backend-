// backend/config/env.js
import dotenv from "dotenv";
dotenv.config();

const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const PACKAGE_CONFIG = {
  silver: { code: "silver", pv: toNum(process.env.PV_SILVER, 35), pairIncome: toNum(process.env.PAIR_SILVER, 10), capPerSession: toNum(process.env.CAP_SILVER, 1) },
  gold:   { code: "gold",   pv: toNum(process.env.PV_GOLD, 155),  pairIncome: toNum(process.env.PAIR_GOLD, 50),  capPerSession: toNum(process.env.CAP_GOLD, 1) },
  ruby:   { code: "ruby",   pv: toNum(process.env.PV_RUBY, 1250), pairIncome: toNum(process.env.PAIR_RUBY, 500), capPerSession: toNum(process.env.CAP_RUBY, 1) }
};

// 8 daily sessions (each 2h15m) — times in 24h "HH:MM" local (server) timezone
const SESSIONS = [
  { idx: 1, start: "06:00", end: "08:15" },
  { idx: 2, start: "08:15", end: "10:30" },
  { idx: 3, start: "10:30", end: "12:45" },
  { idx: 4, start: "12:45", end: "15:00" },
  { idx: 5, start: "15:00", end: "17:15" },
  { idx: 6, start: "17:15", end: "19:30" },
  { idx: 7, start: "19:30", end: "21:45" },
  { idx: 8, start: "21:45", end: "00:00" }
];

// Rank-based royalty percentages (as per your plan):
// star:3% upto Rs35 (handled separately in code where amount cap applies),
// other ranks map from silver_star -> company_star
const ROYALTY_PERCENT = {
  star: toNum(process.env.ROYALTY_STAR, 3),          // special rule: 3% until ₹35 cap
  silver_star: toNum(process.env.ROYALTY_SILVER, 1),
  gold_star: toNum(process.env.ROYALTY_GOLD, 2),
  ruby_star: toNum(process.env.ROYALTY_RUBY, 3),
  emerald_star: toNum(process.env.ROYALTY_EMERALD, 4),
  diamond_star: toNum(process.env.ROYALTY_DIAMOND, 5),
  crown_star: toNum(process.env.ROYALTY_CROWN, 6),
  ambassador_star: toNum(process.env.ROYALTY_AMBASSADOR, 7),
  company_star: toNum(process.env.ROYALTY_COMPANY, 8)
};

// Level income % (levels 1..10 -> 0.5% each)
const LEVEL_INCOME_PERC = {
  perLevelPercent: toNum(process.env.LEVEL_PER_PERCENT, 0.5),
  levels: toNum(process.env.LEVELS_COUNT, 10)
};

// Level Star thresholds (as per plan)
const LEVEL_THRESHOLDS = {
  star1: { directs: toNum(process.env.LEVEL1_DIRECTS, 10) },
  star2: { secondLevelCount: toNum(process.env.LEVEL2_SECOND, 70) },
  star3: { thirdLevelCount: toNum(process.env.LEVEL3_THIRD, 200) }
};

// Fund pools config
const FUND_CONFIG = {
  carFundMonthlyPercent: toNum(process.env.CAR_FUND_PERCENT, 2),   // monthly pool percent
  houseFundMonthlyPercent: toNum(process.env.HOUSE_FUND_PERCENT, 2),
  travelFundPercent: toNum(process.env.TRAVEL_FUND_PERCENT, 0)     // plan says no pool %, keep 0 default
};

// Franchise config
const FRANCHISE = {
  referrerPercentBV: toNum(process.env.FRANCHISE_REFERRER_PCT, 1),
  holderMinPercentPrice: toNum(process.env.FRANCHISE_HOLDER_MIN_PCT, 5)
};

// EPIN rules
const EPIN = {
  enabled: process.env.EPIN_ENABLED !== "false", // default true
  unlimitedTransfer: process.env.EPIN_UNLIMITED_TRANSFER !== "false",
  neverExpire: process.env.EPIN_NEVER_EXPIRE !== "false"
};

// Database / JWT / Server
const DB = {
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/hybridmlm",
  options: { useNewUrlParser: true, useUnifiedTopology: true }
};

const JWT = {
  secret: process.env.JWT_SECRET || "change_this_jwt_secret",
  expiresIn: process.env.JWT_EXPIRES_IN || "30d"
};

const SERVER = {
  port: toNum(process.env.PORT, 4000),
  timezone: process.env.SERVER_TIMEZONE || "Asia/Kolkata"
};

// Export single config object
const CONFIG = {
  PACKAGE_CONFIG,
  SESSIONS,
  ROYALTY_PERCENT,
  LEVEL_INCOME_PERC,
  LEVEL_THRESHOLDS,
  FUND_CONFIG,
  FRANCHISE,
  EPIN,
  DB,
  JWT,
  SERVER
};

export default CONFIG;
