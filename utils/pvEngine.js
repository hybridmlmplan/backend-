import User from "../models/User.js";
import LevelIncome from "../models/LevelIncome.js";
import RoyaltyIncome from "../models/RoyaltyIncome.js";

// -------------------------------------
// CREDIT PV & BV ENGINE
// -------------------------------------
export const creditPV_BV = async (userId, pv, bv) => {
  const user = await User.findById(userId);

  if (!user) return;

  // -------------------------------------
  // 1) SELFPV UPDATE
  // -------------------------------------
  user.totalPV += pv;
  user.currentPackage = user.currentPackage || "silver";

  // Renewal PV Auto-Shift (1440 rule)
  if (user.totalPV >= 1440) {
    user.canTransferPV = true;
  }

  await user.save();

  // -------------------------------------
  // 2) UPLINE PV/BV CREDIT (UNLIMITED LEVEL)
  // Level Income 0.5% each level (1–10)
  // -------------------------------------
  let current = user.sponsorId;
  let level = 1;

  while (current && level <= 10) {
    const upline = await User.findById(current);
    if (!upline) break;

    // CREDIT LEVEL PV
    upline.teamPV += pv;

    // LEVEL INCOME FIXED 0.5%
    const levelIncomeAmount = (bv * 0.5) / 100;

    await LevelIncome.create({
      userId: upline._id,
      fromUserId: userId,
      amount: levelIncomeAmount,
      level,
    });

    await upline.save();

    current = upline.sponsorId;
    level++;
  }

  // -------------------------------------
  // 3) CHECK RANK UPGRADES (PAIR COUNT)
  // -------------------------------------
  await calculateRank(userId);

  // -------------------------------------
  // 4) ROYALTY DISTRIBUTION (Silver Users Only)
  // -------------------------------------
  await distributeRoyalty(userId, bv);

  return true;
};


// -------------------------------------
// RANK ENGINE (STAR → COMPANY STAR)
// -------------------------------------
const calculateRank = async (userId) => {
  const user = await User.findById(userId);
  if (!user) return;

  const pairs = user.pairCount;

  const rankTable = [
    { pairs: 0, rank: "Star" },
    { pairs: 8, rank: "Silver Star" },
    { pairs: 16, rank: "Gold Star" },
    { pairs: 24, rank: "Ruby Star" },
    { pairs: 32, rank: "Emerald Star" },
    { pairs: 40, rank: "Diamond Star" },
    { pairs: 48, rank: "Crown Star" },
    { pairs: 56, rank: "Ambassador Star" },
    { pairs: 64, rank: "Company Star" },
  ];

  for (let r of rankTable) {
    if (pairs >= r.pairs) user.rank = r.rank;
  }

  await user.save();
};


// -------------------------------------
// ROYALTY DISTRIBUTION – SILVER RANK ONLY
// -------------------------------------
const distributeRoyalty = async (userId, bv) => {
  const user = await User.findById(userId);
  if (!user) return;

  if (!user.rank.includes("Star")) return; // Only star rank chain gets royalty

  // Base royalty = 3% BV → Phir rank-wise 1%–8%
  const royaltyPercent = {
    Star: 1,
    "Silver Star": 2,
    "Gold Star": 3,
    "Ruby Star": 4,
    "Emerald Star": 5,
    "Diamond Star": 6,
    "Crown Star": 7,
    "Ambassador Star": 8,
    "Company Star": 8,
  };

  const perRank = royaltyPercent[user.rank] || 1;

  const royaltyAmount = (bv * perRank) / 100;

  await RoyaltyIncome.create({
    userId,
    amount: royaltyAmount,
    rank: user.rank,
  });
};
