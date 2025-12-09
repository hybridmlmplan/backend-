// services/fundService.js
import mongoose from "mongoose";
import FundPool from "../models/FundPool.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import WalletLedger from "../models/WalletLedger.js";

/**
 * Core rules
 * - BV generated from repurchase/products/services
 * - Part of BV goes into pools
 * - Pools: car, house, luxury (configurable)
 * - Qualifiers: based on rank level (configurable)
 * - Distribution: equally divided to qualifiers
 * - User cap: per cycle income limit (optional)
 * - Pool auto reset after distribution
 */

const POOLS = ["car", "house", "luxury"];

// each sale BV contributes some % (configurable per pool)
const CONTRIBUTION = {
  car: 0.01,     // 1%
  house: 0.005,  // 0.5%
  luxury: 0.002  // 0.2%
};

// required rank to qualify
const QUALIFY_RANK = {
  car: 2,
  house: 4,
  luxury: 6
};

// optional cap per user per cycle (null = unlimited)
const USER_CAP = {
  car: null,
  house: null,
  luxury: null
};

// helper tx id
function tx(prefix = "FUND") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
}

// add BV to pools
export async function addBVtoPools(totalBV) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    for (const pool of POOLS) {
      const percent = CONTRIBUTION[pool] || 0;
      const amount = totalBV * percent;
      if (amount <= 0) continue;

      await FundPool.findOneAndUpdate(
        { pool },
        { $inc: { amount: amount } },
        { upsert: true, new: true, session }
      );
    }

    await session.commitTransaction();
    session.endSession();
    return true;
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    console.error("fundService.addBVtoPools", e);
    throw e;
  }
}

// distribute pool
export async function distributePool(pool) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const fp = await FundPool.findOne({ pool }).session(session);
    if (!fp || fp.amount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return { distributed: false, amount: 0 };
    }

    // find users who qualify
    const minRank = QUALIFY_RANK[pool];
    const users = await User.find({
      "rankStatus.rubyRank": { $gte: minRank } // use ruby ranks for top pools
    }).session(session);

    if (!users.length) {
      await session.commitTransaction();
      session.endSession();
      return { distributed: false, noQualifiers: true };
    }

    const share = fp.amount / users.length;

    for (const u of users) {
      const wallet = await Wallet.findOneAndUpdate(
        { user: u._id },
        { $inc: { balance: share } },
        { upsert: true, new: true, session }
      );

      await WalletLedger.create([{
        userId: u._id,
        txId: tx("POOL"),
        type: "credit",
        category: "pool",
        amount: share,
        balanceAfter: wallet.balance,
        status: "completed",
        ref: pool,
        note: `${pool} pool distribution`
      }], { session });
    }

    // reset pool
    fp.amount = 0;
    await fp.save({ session });

    await session.commitTransaction();
    session.endSession();

    return {
      distributed: true,
      pool,
      total: fp.amount,
      perUser: share,
      users: users.length
    };
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    console.error("fundService.distributePool", e);
    throw e;
  }
}

// distribute all pools
export async function distributeAllPools() {
  const results = {};
  for (const p of POOLS) {
    results[p] = await distributePool(p);
  }
  return results;
}

// get pool stats
export async function getPools() {
  const data = await FundPool.find({}).lean();
  return data;
}
