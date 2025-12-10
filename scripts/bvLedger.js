// backend/scripts/bvLedger.js
// BV ledger helpers (production-ready, transaction-safe)
// Usage:
//   await creditBV(userId, 100, { source: "repurchase", orderId: "ORD123" });
//   await consumeBV(userId, 50, { reason: "rank_bonus_settlement" });

import mongoose from "mongoose";
import BVLedger from "../models/BVLedger.js";   // expected schema: { user, amount, type, meta, createdAt }
import FundPool from "../models/FundPool.js";   // expected schema: { totalBV: Number, updatedAt, ... }

const SAFE_MIN = 0.000001;

/**
 * Credit BV to user and increment company CTO BV pool (atomic)
 * @param {String|ObjectId} userId
 * @param {Number} bvAmount  - positive number
 * @param {Object} meta - optional metadata (source, orderId, note)
 */
export async function creditBV(userId, bvAmount, meta = {}) {
  if (!userId) throw new Error("creditBV: missing userId");
  if (!bvAmount || typeof bvAmount !== "number" || bvAmount <= SAFE_MIN) return null;

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const ledgerEntry = await BVLedger.create(
      [
        {
          user: userId,
          amount: bvAmount,
          type: "credit",
          meta,
          createdAt: new Date()
        }
      ],
      { session }
    );

    // increment company CTO BV pool
    const poolUpdate = await FundPool.findOneAndUpdate(
      {},
      { $inc: { totalBV: bvAmount }, $set: { updatedAt: new Date() } },
      { upsert: true, new: true, session }
    );

    await session.commitTransaction();
    session.endSession();

    return { ledger: ledgerEntry[0], fundPool: poolUpdate };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("creditBV error:", err);
    throw err;
  }
}

/**
 * Consume BV from user's ledger (record negative entry) and decrement company CTO BV pool (atomic)
 * @param {String|ObjectId} userId
 * @param {Number} bvAmount - positive number to consume
 * @param {Object} meta
 */
export async function consumeBV(userId, bvAmount, meta = {}) {
  if (!userId) throw new Error("consumeBV: missing userId");
  if (!bvAmount || typeof bvAmount !== "number" || bvAmount <= SAFE_MIN) return null;

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const ledgerEntry = await BVLedger.create(
      [
        {
          user: userId,
          amount: -Math.abs(bvAmount),
          type: "debit",
          meta,
          createdAt: new Date()
        }
      ],
      { session }
    );

    // decrement company CTO BV pool (ensure it does not go negative)
    const pool = await FundPool.findOne({}, null, { session });
    const current = pool ? (pool.totalBV || 0) : 0;

    const newTotal = Math.max(0, current - bvAmount);
    const poolUpdate = await FundPool.findOneAndUpdate(
      {},
      { $set: { totalBV: newTotal, updatedAt: new Date() } },
      { upsert: true, new: true, session }
    );

    await session.commitTransaction();
    session.endSession();

    return { ledger: ledgerEntry[0], fundPool: poolUpdate };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("consumeBV error:", err);
    throw err;
  }
}

/**
 * Get current company CTO BV (safe)
 */
export async function getCTOBV() {
  const pool = await FundPool.findOne().lean();
  return (pool && typeof pool.totalBV === "number") ? pool.totalBV : 0;
}

export default { creditBV, consumeBV, getCTOBV };
