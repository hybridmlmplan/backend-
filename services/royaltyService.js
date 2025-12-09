// services/royaltyService.js
import mongoose from "mongoose";
import User from "../models/User.js";
import FundPool from "../models/FundPool.js";
import Wallet from "../models/Wallet.js";
import WalletLedger from "../models/WalletLedger.js";
import RoyaltyLog from "../models/RoyaltyLog.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Royalty distribution service
 *
 * Design decisions:
 * - On BV-generating event (order/repurchase), call distributeRoyalty(totalBV)
 * - royaltyPoolPercent: portion of BV reserved for royalty distribution (configurable)
 * - Only Silver package ranks receive royalty.
 * - Each Silver rank level has a weight (derived from your percentage tiers).
 * - Pool is divided among eligible Silver users proportional to their weight.
 *
 * Configurable values below.
 */

// percent of BV that becomes royalty pool (0.02 = 2% of BV). Change as required.
const ROYALTY_POOL_PERCENT = 0.02;

// Map silver rank level (0..8) to a weight representing relative share.
// This map is based on your earlier tiers: Sp Star (level0) 3% etc.
// We convert those direct percentages to relative weights for fair splitting.
const SILVER_RANK_WEIGHT = {
  0: 3,  // Sp Star - (3% tier)
  1: 1,  // Sp Silver Star - (1%)
  2: 2,  // Sp Gold Star - (2%)
  3: 3,  // Sp Ruby Star - (3%)
  4: 4,  // Sp Emerald Star - (4%)
  5: 5,  // Sp Diamond Star - (5%)
  6: 6,  // Sp Crown Star - (6%)
  7: 7,  // Sp Ambassador Star - (7%)
  8: 8   // Sp Company Star - (8%)
};

// helper tx
function makeTxId(prefix = "ROY") {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random()*90000)+10000}`;
}

/**
 * Distribute royalty for given BV amount.
 * Returns summary of distribution.
 */
export async function distributeRoyalty(totalBV) {
  if (!totalBV || totalBV <= 0) return { distributed: false, reason: "No BV" };

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // compute pool
    const pool = Number((totalBV * ROYALTY_POOL_PERCENT).toFixed(2));
    if (pool <= 0) {
      await session.abortTransaction();
      session.endSession();
      return { distributed: false, reason: "Pool zero" };
    }

    // Fetch eligible users: those with package 'silver' or who have silverRank >=0 ?
    // We'll select users who have ever been Silver package and have a silver rank level >=0
    const eligibleUsers = await User.find({
      package: { $in: ["silver","gold","ruby","non_active",""] }, // include users since rank may persist even if they upgraded; but requirement said royalty only Silver ranks — we'll check rankStatus.silverRank >=0
      "rankStatus.silverRank": { $gte: 0 } // users with silver rank info
    }).session(session);

    // Filter only those with meaningful silverRank (>=0)
    const filtered = eligibleUsers.filter(u => {
      const lvl = (u.rankStatus && typeof u.rankStatus.silverRank === "number") ? u.rankStatus.silverRank : -1;
      return lvl >= 0;
    });

    if (!filtered.length) {
      // No eligible users — pool remains unallocated (you may choose to keep in FundPool)
      // We'll return pool back to FundPool.companyBV for later distribution.
      await FundPool.findOneAndUpdate({}, { $inc: { companyBV: pool } }, { upsert: true, session });
      await session.commitTransaction();
      session.endSession();
      return { distributed: false, reason: "No eligible users", poolSavedToFund: true };
    }

    // Sum weights
    let totalWeight = 0;
    const userWeights = filtered.map(u => {
      const lvl = (u.rankStatus && typeof u.rankStatus.silverRank === "number") ? u.rankStatus.silverRank : 0;
      const w = SILVER_RANK_WEIGHT.hasOwnProperty(lvl) ? SILVER_RANK_WEIGHT[lvl] : 0;
      totalWeight += w;
      return { user: u, level: lvl, weight: w };
    });

    if (totalWeight <= 0) {
      await FundPool.findOneAndUpdate({}, { $inc: { companyBV: pool } }, { upsert: true, session });
      await session.commitTransaction();
      session.endSession();
      return { distributed: false, reason: "Zero total weight" };
    }

    const distributions = [];
    for (const uw of userWeights) {
      const share = Number(((pool * uw.weight) / totalWeight).toFixed(2));
      if (share <= 0) continue;

      // credit wallet
      const wallet = await Wallet.findOneAndUpdate(
        { user: uw.user._id },
        { $inc: { balance: share } },
        { upsert: true, new: true, session }
      );

      // ledger
      const txId = makeTxId();
      await WalletLedger.create([{
        userId: uw.user._id,
        txId,
        type: "credit",
        category: "royalty",
        amount: share,
        balanceAfter: wallet.balance,
        status: "completed",
        ref: null,
        note: `Royalty pool distribution from BV ${totalBV}`
      }], { session });

      // record royalty log
      await RoyaltyLog.create([{
        sourceBV: totalBV,
        royaltyPool: pool,
        paidToUser: uw.user._id,
        userShare: share,
        userRankLevel: uw.level,
        txId,
        note: `Royalty for silver level ${uw.level}`
      }], { session });

      distributions.push({ userId: uw.user._id, share, level: uw.level, txId });
    }

    await session.commitTransaction();
    session.endSession();

    return { distributed: true, pool, totalBV, count: distributions.length, distributions };
  } catch (err) {
    try { await session.abortTransaction(); } catch(e){}
    session.endSession();
    console.error("distributeRoyalty error", err);
    throw err;
  }
}
