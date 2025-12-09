import Order from "../models/Order.js";
import User from "../models/User.js";
import FundPool from "../models/FundPool.js";
import { distributeLevelIncome } from "./levelService.js";

export const processOrder = async (userId, amount, pv, bv) => {
  // Find user
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  // Create order entry
  const order = await Order.create({
    user: userId,
    amount,
    pv,
    bv,
    status: "completed",
  });

  // Update user PV/BV
  user.totalPV += Number(pv);
  user.totalBV += Number(bv);
  await user.save();

  // Ensure FundPool exists
  let pool = await FundPool.findOne();
  if (!pool) {
    pool = await FundPool.create({
      totalBV: 0,
      silverRoyaltyPool: 0,
      goldRoyaltyPool: 0,
      rubyRoyaltyPool: 0,
      lastDistribution: null,
    });
  }

  // Add BV to fund pool
  await FundPool.updateOne({}, { $inc: { totalBV: bv } });

  // Distribute level incomes
  await distributeLevelIncome(userId, bv);

  return order;
};
