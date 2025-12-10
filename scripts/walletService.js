// backend/scripts/walletService.js
// Wallet service — credit, debit, transfer, ledger entries
// Usage:
//   await creditWallet(userId, amount, { type:"pair_income", meta:{...}, idempotencyKey });
//   await debitWallet(userId, amount, { type:"withdrawal", meta:{...} });
//   await transferWallet(fromUserId, toUserId, amount, { type:"internal_transfer", meta:{}, idempotencyKey });

import mongoose from "mongoose";
import Wallet from "../models/Wallet.js";
import WalletLedger from "../models/WalletLedger.js";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";

const SAFE_MIN = 0.01;

/**
 * addWalletTx
 * Generic helper used by other scripts (e.g., binaryEngine).
 * Creates Transaction record + WalletLedger entry + updates Wallet.balance atomically.
 *
 * @param {ObjectId} userId
 * @param {Number} amount - positive to credit, negative to debit
 * @param {String} type - e.g., "pair_income","rank_upgrade","withdrawal","royalty"
 * @param {Object} opts - { meta: Object, idempotencyKey: String (optional), session: mongoose.Session (optional) }
 */
export async function addWalletTx(userId, amount, type, opts = {}) {
  if (!userId) throw new Error("addWalletTx: missing userId");
  if (typeof amount !== "number" || Math.abs(amount) < SAFE_MIN) throw new Error("addWalletTx: invalid amount");

  const session = opts.session || await mongoose.startSession();
  let startedLocal = false;
  if (!opts.session) { session.startTransaction(); startedLocal = true; }

  try {
    // Idempotency: if idempotencyKey provided, skip if Transaction with same key exists
    if (opts.idempotencyKey) {
      const exists = await Transaction.findOne({ "meta.idempotencyKey": opts.idempotencyKey }).session(session);
      if (exists) {
        if (startedLocal) { await session.commitTransaction(); session.endSession(); }
        return { status: true, skipped: true, reason: "idempotent" };
      }
    }

    // Ensure user exists (optional)
    const user = await User.findById(userId).session(session);
    if (!user) throw new Error("addWalletTx: user not found");

    // Update wallet balance (credit or debit)
    if (amount < 0) {
      // debit: ensure sufficient balance
      const w = await Wallet.findOne({ user: userId }).session(session);
      const balance = (w && w.balance) ? w.balance : 0;
      if (balance + amount < -0.0001) { // amount is negative
        throw new Error("Insufficient wallet balance");
      }
    }

    // Wallet update
    await Wallet.findOneAndUpdate(
      { user: userId },
      { $inc: { balance: amount } },
      { upsert: true, session }
    );

    // Create Transaction record (master ledger)
    const tx = await Transaction.create([{
      user: userId,
      type,
      amount,
      meta: opts.meta || {},
      createdAt: new Date()
    }], { session });

    // Create WalletLedger entry (detailed)
    await WalletLedger.create([{
      userId,
      amount,
      type,
      note: opts.meta && opts.meta.note ? opts.meta.note : null,
      reference: tx[0]._id,
      createdAt: new Date()
    }], { session });

    if (startedLocal) { await session.commitTransaction(); session.endSession(); }
    return { status: true, tx: tx[0] };
  } catch (err) {
    if (startedLocal) { await session.abortTransaction(); session.endSession(); }
    // bubble up
    throw err;
  }
}

/**
 * creditWallet - convenience wrapper to credit positive amount
 */
export async function creditWallet(userId, amount, opts = {}) {
  if (typeof amount !== "number" || amount <= 0) throw new Error("creditWallet: invalid amount");
  return addWalletTx(userId, +amount, opts.type || "credit", opts);
}

/**
 * debitWallet - convenience wrapper to debit (withdrawal)
 */
export async function debitWallet(userId, amount, opts = {}) {
  if (typeof amount !== "number" || amount <= 0) throw new Error("debitWallet: invalid amount");
  // pass negative amount to addWalletTx
  return addWalletTx(userId, -Math.abs(amount), opts.type || "debit", opts);
}

/**
 * transferWallet
 * Internal transfer between two users (atomic).
 * Optional fee taken from sender and credited to company/admin (adminId).
 *
 * @param {ObjectId} fromUserId
 * @param {ObjectId} toUserId
 * @param {Number} amount
 * @param {Object} opts - { feePercent: Number (0-100), adminId: ObjectId (fee receiver), meta, idempotencyKey }
 */
export async function transferWallet(fromUserId, toUserId, amount, opts = {}) {
  if (!fromUserId || !toUserId) throw new Error("transferWallet: missing from/to");
  if (String(fromUserId) === String(toUserId)) throw new Error("transferWallet: cannot transfer to same user");
  if (typeof amount !== "number" || amount <= 0) throw new Error("transferWallet: invalid amount");

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // idempotency
    if (opts.idempotencyKey) {
      const exists = await Transaction.findOne({ "meta.idempotencyKey": opts.idempotencyKey }).session(session);
      if (exists) { await session.commitTransaction(); session.endSession(); return { status: true, skipped: true }; }
    }

    // compute fee
    const feePercent = typeof opts.feePercent === "number" ? opts.feePercent : 0;
    const feeAmount = +(amount * (feePercent / 100));
    const sendAmount = +(amount - feeAmount);

    // Debit sender (amount)
    await addWalletTx(fromUserId, -amount, opts.type || "transfer_debit", { meta: { ...opts.meta, to: toUserId }, session });

    // Credit receiver (sendAmount)
    await addWalletTx(toUserId, sendAmount, opts.type || "transfer_credit", { meta: { ...opts.meta, from: fromUserId }, session });

    // Credit fee to admin if applicable
    if (feeAmount > 0 && opts.adminId) {
      await addWalletTx(opts.adminId, feeAmount, "transfer_fee", { meta: { from: fromUserId, to: toUserId }, session });
    }

    await session.commitTransaction();
    session.endSession();
    return { status: true, transferred: sendAmount, fee: feeAmount };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

/**
 * getWalletBalance
 */
export async function getWalletBalance(userId) {
  const w = await Wallet.findOne({ user: userId }).lean();
  return (w && typeof w.balance === "number") ? +w.balance : 0;
}

export default {
  addWalletTx,
  creditWallet,
  debitWallet,
  transferWallet,
  getWalletBalance
};
