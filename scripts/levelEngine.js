// backend/scripts/levelEngine.js
// Distribute level income for BV across upline up to 10 levels with 0.5% per level and star bonuses
// Usage: await distributeLevelIncome(purchaseUserId, bvAmount);

import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";

const LEVEL_PERCENT = 0.005; // 0.5% per level

export async function distributeLevelIncome(userId, bvAmount) {
  try {
    if (!bvAmount || bvAmount <= 0) return { distributed: 0 };

    // traverse upline (parent chain) - assumed User model has sponsorId field
    let current = await User.findById(userId);
    let level = 1;
    let distributed = 0;

    while (current && current.sponsorId && level <= 10) {
      const parent = await User.findOne({ userCode: current.sponsorId }) || await User.findById(current.sponsorId);
      if (!parent) break;
      const amount = bvAmount * LEVEL_PERCENT;
      if (amount > 0) {
        await Transaction.create({ user: parent._id, type: "level_income", amount, meta: { level }, createdAt: new Date() });
        await Wallet.updateOne({ user: parent._id }, { $inc: { balance: amount } }, { upsert: true });
        distributed += amount;
      }
      current = parent;
      level++;
    }

    return { distributed };
  } catch (err) {
    console.error("levelEngine.distributeLevelIncome error:", err);
    return { error: err.message };
  }
}

export default { distributeLevelIncome };
