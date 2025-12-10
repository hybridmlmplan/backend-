// backend/scripts/fundEngine.js
// Handles BV-based funds: Car Fund 2% monthly (RubyStar+), House Fund 2% monthly (DiamondStar+), Travel fund (special handling).
// Usage: call runMonthlyFundDistribution()

import FundPool from "../models/FundPool.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";

export async function runMonthlyFundDistribution(bvPoolAmount = null) {
  try {
    // If bvPoolAmount not provided, read from FundPool.totalBV and calculate proportions
    const pool = await FundPool.findOne({});
    const totalBV = bvPoolAmount ?? (pool?.totalBV || 0);

    if (!totalBV || totalBV <= 0) return { distributed: 0 };

    // Car Fund: 2% of CTO BV distributed among RubyStar+ holders
    const carPool = totalBV * 0.02;
    const housePool = totalBV * 0.02;

    // RubyStar+ holders
    const rubyHolders = await User.find({ "rank.package": "ruby", "rank.level": { $gte: 4 } }); // assuming level indexes map to RubyStar threshold
    // DiamondStar+ holders
    const diamondHolders = await User.find({ "rank.name": { $in: ["Diamond Star", "DiamondStar", "Sp Diamond Star", "Rp Diamond Star", "Gp Diamond Star"] } });

    const results = { carDistributed: 0, houseDistributed: 0 };

    if (rubyHolders.length > 0) {
      const perUser = carPool / rubyHolders.length;
      for (const u of rubyHolders) {
        await Transaction.create({ user: u._id, type: "fund_car", amount: perUser, createdAt: new Date() });
        await User.updateOne({ _id: u._id }, { $inc: { walletBalance: perUser } }); // or Wallet model update
        results.carDistributed += perUser;
      }
    }

    if (diamondHolders.length > 0) {
      const perUser = housePool / diamondHolders.length;
      for (const u of diamondHolders) {
        await Transaction.create({ user: u._id, type: "fund_house", amount: perUser, createdAt: new Date() });
        await User.updateOne({ _id: u._id }, { $inc: { walletBalance: perUser } });
        results.houseDistributed += perUser;
      }
    }

    // Mark fundPool consumed or deduct as per business (we'll deduct total distributed)
    await FundPool.updateOne({}, { $inc: { totalBV: - (results.carDistributed + results.houseDistributed) } });

    return { status: true, results };
  } catch (err) {
    console.error("fundEngine.runMonthlyFundDistribution error:", err);
    return { error: err.message };
  }
}

export default { runMonthlyFundDistribution };
