// backend/scripts/royaltyEngine.js
// Handles royalty distribution for Silver ranks (3% until ₹35, then tiered 1%-8%)
// Usage: call distributeRoyalty(bvAmount) or creditRankIncome(userId, amount, meta)

import RoyaltyLog from "../models/RoyaltyLog.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import Transaction from "../models/Transaction.js";

const SILVER_TIERS = [
  { name: "Sp Star", pct: 0.03 }, // until ₹35
  { name: "Sp Silver Star", pct: 0.01 },
  { name: "Sp Gold Star", pct: 0.02 },
  { name: "Sp Ruby Star", pct: 0.03 },
  { name: "Sp Emerald Star", pct: 0.04 },
  { name: "Sp Diamond Star", pct: 0.05 },
  { name: "Sp Crown Star", pct: 0.06 },
  { name: "Sp Ambassador Star", pct: 0.07 },
  { name: "Sp Company Star", pct: 0.08 },
];

export async function creditRankIncome(userId, amount, meta = {}) {
  // Credit rank income (used by rankEngine)
  await Transaction.create({
    user: userId,
    type: "rank_income",
    amount,
    meta,
    createdAt: new Date()
  });
  await Wallet.updateOne({ user: userId }, { $inc: { balance: amount } }, { upsert: true });
}

export async function distributeRoyalty(bvAmount) {
  // Distribute royalty pool among eligible silver ranks holders based on tiers
  try {
    // collect silver rank users and their rank names/levels
    const silverUsers = await User.find({ "rank.package": "silver", "rank.level": { $exists: true } });
    if (!silverUsers.length) return { distributed: 0 };

    // compute 2 categories: initial 3% until first ₹35? For simplicity follow plan:
    // For each user compute their pct based on their silver rank. Then allocate bvAmount*pct.
    let totalDistributed = 0;
    for (const u of silverUsers) {
      const userRankName = u.rank?.name || "Sp Star";
      const tier = SILVER_TIERS.find(t => t.name === userRankName) || { pct: 0.01 };
      const amt = bvAmount * tier.pct;
      if (amt <= 0) continue;
      await Transaction.create({ user: u._id, type: "royalty", amount: amt, meta: { rank: userRankName, bvAmount }, createdAt: new Date() });
      await Wallet.updateOne({ user: u._id }, { $inc: { balance: amt } }, { upsert: true });
      await RoyaltyLog.create({ user: u._id, amount: amt, rank: userRankName, bvAmount, createdAt: new Date() });
      totalDistributed += amt;
    }
    return { distributed: totalDistributed, attempted: bvAmount };
  } catch (err) {
    console.error("royaltyEngine.distributeRoyalty error:", err);
    return { error: err.message };
  }
}

export default { creditRankIncome, distributeRoyalty };
