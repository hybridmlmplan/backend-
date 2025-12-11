// services/fundService.js
// --------------------------------------------------------
// MASTER FUND ENGINE
// Royalty, Rank Royalty, Car Fund, House Fund, Travel Fund,
// Franchise %, BV distribution, Level %, Rank progression
// --------------------------------------------------------

const User = require("../models/User");
const BVLedger = require("../models/BVLedger");
const RankHistory = require("../models/RankHistory");
const Wallet = require("../models/Wallet");
const Pool = require("../models/Pool"); // car/house/travel funds
const Franchise = require("../models/Franchise");

// --------------------------------------------
// CONFIG
// --------------------------------------------

const RANKS = [
  { name: "Star", percent: 1 },
  { name: "Silver Star", percent: 2 },
  { name: "Gold Star", percent: 4 },
  { name: "Ruby Star", percent: 8 },
  { name: "Emerald Star", percent: 16 },
  { name: "Diamond Star", percent: 32 },
  { name: "Crown Star", percent: 64 },
  { name: "Ambassador Star", percent: 128 },
  { name: "Company Star", percent: 256 },
];

// Silver-rank royalty (after first ₹35 refund)
const SILVER_RANK_ROYALTY = {
  Star: 1,
  SilverStar: 1,
  GoldStar: 1,
  RubyStar: 2,
  EmeraldStar: 3,
  DiamondStar: 4,
  CrownStar: 5,
  AmbassadorStar: 6,
  CompanyStar: 8,
};

// Level BV Income
const LEVEL_PERCENTS = {
  1: 0.5,
  2: 0.5,
  3: 0.5,
  4: 0.5,
  5: 0.5,
  6: 0.5,
  7: 0.5,
  8: 0.5,
  9: 0.5,
  10: 0.5,
};

// Level Star Bonus %
const STAR_BONUS = {
  1: 1,
  2: 1.1,
  3: 1.2,
};

// Funds (Pools)
const FUND_PERCENT = {
  car: 2, // Ruby Star and above
  house: 2, // Diamond Star and above
};

// Franchise
const FRANCHISE_PERCENT = 1; // 1% sponsor BV
const FRANCHISE_HOLDER_MIN = 5; // franchise holder min 5% product profit



// ==================================================================
// 🟦 MAIN FUNCTION
// ==================================================================
exports.processBVIncome = async function (userId, bvAmount, source) {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    // Ledger Entry
    await BVLedger.create({
      userId,
      bv: bvAmount,
      source,
      date: new Date(),
    });

    // 1) Level Income
    await distributeLevelIncome(user, bvAmount);

    // 2) Rank Royalty
    await distributeRankRoyalty(user, bvAmount);

    // 3) Silver continuous Royalty (special rule)
    await distributeSilverContinuousRoyalty(user, bvAmount);

    // 4) Funds (Car, House, Travel)
    await allocateFunds(user, bvAmount);

    // 5) Franchise BV %
    await processFranchiseIncome(user, bvAmount);

    // Update total BV
    user.totalBV += bvAmount;
    await user.save();

    return true;
  } catch (err) {
    console.error("Fund processing error:", err);
    return false;
  }
};



// ==================================================================
// 🟦 1) LEVEL BV INCOME (0.5% x 10 Levels)
// ==================================================================
async function distributeLevelIncome(user, bv) {
  let current = user;

  for (let level = 1; level <= 10; level++) {
    if (!current.sponsorId) break;

    const sponsor = await User.findById(current.sponsorId);
    if (!sponsor) break;

    let percent = LEVEL_PERCENTS[level];
    let incomeAmount = (bv * percent) / 100;

    if (incomeAmount > 0) {
      await creditWallet(sponsor._id, incomeAmount, `Level ${level} BV Income`);
    }

    current = sponsor;
  }
}



// ==================================================================
// 🟦 2) RANK ROYALTY (1% to 256% cumulative)
// ==================================================================
async function distributeRankRoyalty(user, bv) {
  let uplines = await getUplineUsers(user);

  for (let u of uplines) {
    if (!u.rank) continue;

    let rankObj = RANKS.find(r => r.name === u.rank);
    if (!rankObj) continue;

    let percent = rankObj.percent; // cumulative

    let amount = (bv * percent) / 100;

    await creditWallet(u._id, amount, `Rank Royalty (${u.rank})`);
  }
}



// ==================================================================
// 🟦 3) SILVER Continuous Royalty Logic
// ==================================================================
async function distributeSilverContinuousRoyalty(user, bv) {
  let uplines = await getUplineUsers(user);

  for (let u of uplines) {
    if (!u.isSilverRank) continue;

    let percent = SILVER_RANK_ROYALTY[u.rank] || 0;

    let amount = (bv * percent) / 100;

    await creditWallet(u._id, amount, `Silver Continuous Royalty (${u.rank})`);
  }
}



// ==================================================================
// 🟦 4) FUNDS — Car, House, Travel
// ==================================================================
async function allocateFunds(user, bv) {
  // Car Fund
  if (user.rank && isRankOrAbove(user.rank, "Ruby Star")) {
    let poolBV = (bv * FUND_PERCENT.car) / 100;
    await Pool.updateOne({ name: "car" }, { $inc: { amount: poolBV } });
  }

  // House Fund
  if (user.rank && isRankOrAbove(user.rank, "Diamond Star")) {
    let poolBV = (bv * FUND_PERCENT.house) / 100;
    await Pool.updateOne({ name: "house" }, { $inc: { amount: poolBV } });
  }

  // Travel Fund (once yearly credit)
  if (user.rank && isRankOrAbove(user.rank, "Ruby Star")) {
    await Pool.updateOne({ name: "travel" }, { $inc: { amount: bv } });
  }
}



// ==================================================================
// 🟦 5) FRANCHISE INCOME
// ==================================================================
async function processFranchiseIncome(user, bv) {
  if (user.sponsorId) {
    let sponsor = await User.findById(user.sponsorId);
    if (sponsor) {
      let amount = (bv * FRANCHISE_PERCENT) / 100;
      await creditWallet(sponsor._id, amount, `Franchise Sponsor BV`);
    }
  }

  // Franchise Holder Commission
  let franchise = await Franchise.findOne({ userId: userId });
  if (franchise) {
    let amount = (bv * franchise.percent) / 100;
    await creditWallet(franchise.userId, amount, `Franchise Holder Income`);
  }
}



// ==================================================================
// 🟩 UTILITIES
// ==================================================================
async function creditWallet(userId, amount, remark) {
  if (amount <= 0) return;

  await Wallet.create({
    userId,
    amount,
    type: "credit",
    remark,
    date: new Date(),
  });

  await User.updateOne({ _id: userId }, { $inc: { walletBalance: amount } });
}

async function getUplineUsers(user) {
  let uplines = [];
  let current = user;

  while (current.sponsorId) {
    const s = await User.findById(current.sponsorId);
    if (!s) break;
    uplines.push(s);
    current = s;
  }

  return uplines;
}

function isRankOrAbove(rank, baseRank) {
  let order = RANKS.map(r => r.name);
  return order.indexOf(rank) >= order.indexOf(baseRank);
}
