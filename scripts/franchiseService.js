// backend/scripts/franchiseService.js
// Helpers for franchise purchase, BV calculation, referral split
// Usage: await processFranchiseSale(franchiseId, buyerUserId, price)

import Franchise from "../models/Franchise.js";
import FranchiseOrder from "../models/FranchiseOrder.js";
import User from "../models/User.js";
import FundPool from "../models/FundPool.js";
import Transaction from "../models/Transaction.js";

export async function processFranchiseSale(franchiseId, buyerUserId, price) {
  try {
    const franchise = await Franchise.findById(franchiseId);
    if (!franchise) throw new Error("Franchise not found");

    // Create order
    const order = await FranchiseOrder.create({ franchise: franchiseId, buyer: buyerUserId, price, createdAt: new Date() });

    // Commission: referrer 1% on BV -> if franchise has referrer
    const referrer = await User.findById(franchise.referrer);
    const bvEquivalent = price; // or map via product config
    if (referrer) {
      const refAmt = bvEquivalent * 0.01;
      await Transaction.create({ user: referrer._id, type: "franchise_referrer", amount: refAmt, meta: { order: order._id } });
      await User.updateOne({ _id: referrer._id }, { $inc: { walletBalance: refAmt } });
    }

    // Holder income: minimum 5% of selling price
    const holder = await User.findById(franchise.holder);
    if (holder) {
      const holderAmt = price * (franchise.holderPercent || 0.05);
      await Transaction.create({ user: holder._id, type: "franchise_holder", amount: holderAmt, meta: { order: order._id } });
      await User.updateOne({ _id: holder._id }, { $inc: { walletBalance: holderAmt } });
    }

    // Add BV to FundPool
    await FundPool.updateOne({}, { $inc: { totalBV: bvEquivalent } }, { upsert: true });

    return { status: true, orderId: order._id };
  } catch (err) {
    console.error("franchiseService.processFranchiseSale error:", err);
    return { error: err.message };
  }
}

export default { processFranchiseSale };
