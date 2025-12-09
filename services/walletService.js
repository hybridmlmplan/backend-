// services/walletService.js
import mongoose from "mongoose";
import Wallet from "../models/Wallet.js";
import WalletLedger from "../models/WalletLedger.js";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";

/**
 * Wallet service
 * - credit(userId, amount, category, ref = null, note)
 * - debit(userId, amount, category, ref = null, note)  // for withdrawals or admin debit
 * - getBalance(userId)
 * - createWithdrawRequest(userId, amount, details)
 * - adminApproveWithdraw(txId)
 *
 * All money movements create WalletLedger entries and Transaction records.
 */

// helper tx id
function makeTxId(prefix = "WTX") {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`;
}

// ensure wallet doc exists and return it (session optional)
async function ensureWallet(userId, session = null) {
  return await Wallet.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { balance: 0, pending: 0, updatedAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true, session }
  );
}

// CREDIT
export async function credit(userId, amount, category = "binary", ref = null, note = "") {
  if (amount <= 0) throw new Error("Amount must be positive");

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const wallet = await ensureWallet(userId, session);

    // increment balance
    wallet.balance = (wallet.balance || 0) + Number(amount);
    wallet.updatedAt = new Date();
    await wallet.save({ session });

    const txId = makeTxId("CR");

    // create ledger
    await WalletLedger.create([{
      userId,
      txId,
      type: "credit",
      category,
      amount: Number(amount),
      balanceAfter: wallet.balance,
      status: "completed",
      ref,
      note
    }], { session });

    // create transaction record for audit
    await Transaction.create([{
      txId,
      userId,
      amount: Number(amount),
      type: category,
      status: "completed",
      ref
    }], { session });

    await session.commitTransaction();
    session.endSession();

    return { txId, balance: wallet.balance };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

// DEBIT (for instant debit; use withdraw flow for pending)
export async function debit(userId, amount, category = "withdraw", ref = null, note = "") {
  if (amount <= 0) throw new Error("Amount must be positive");

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const wallet = await ensureWallet(userId, session);
    if ((wallet.balance || 0) < amount) {
      throw new Error("Insufficient balance");
    }

    wallet.balance = (wallet.balance || 0) - Number(amount);
    wallet.updatedAt = new Date();
    await wallet.save({ session });

    const txId = makeTxId("DB");

    await WalletLedger.create([{
      userId,
      txId,
      type: "debit",
      category,
      amount: Number(amount),
      balanceAfter: wallet.balance,
      status: "completed",
      ref,
      note
    }], { session });

    await Transaction.create([{
      txId,
      userId,
      amount: Number(amount),
      type: category,
      status: "completed",
      ref
    }], { session });

    await session.commitTransaction();
    session.endSession();

    return { txId, balance: wallet.balance };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

// CREATE withdraw request (moves amount to pending, ledger entry pending)
export async function createWithdrawRequest(userId, amount, details = {}) {
  if (amount <= 0) throw new Error("Amount must be positive");

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const wallet = await ensureWallet(userId, session);
    if ((wallet.balance || 0) < amount) throw new Error("Insufficient balance");

    wallet.balance = wallet.balance - Number(amount);
    wallet.pending = (wallet.pending || 0) + Number(amount);
    wallet.updatedAt = new Date();
    await wallet.save({ session });

    const txId = makeTxId("WREQ");

    // create ledger pending
    await WalletLedger.create([{
      userId,
      txId,
      type: "debit",
      category: "withdraw",
      amount: Number(amount),
      balanceAfter: wallet.balance,
      status: "pending",
      ref: null,
      note: details.note || "Withdraw request"
    }], { session });

    // transaction record pending
    await Transaction.create([{
      txId,
      userId,
      amount: Number(amount),
      type: "withdraw",
      status: "pending",
      ref: null
    }], { session });

    await session.commitTransaction();
    session.endSession();

    return { txId, balance: wallet.balance, pending: wallet.pending };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

// ADMIN: approve withdraw (move pending -> completed and create final ledger)
export async function adminApproveWithdraw(txId, adminNote = "") {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // find pending ledger/transaction by txId
    const ledger = await WalletLedger.findOne({ txId, status: "pending", category: "withdraw" }).session(session);
    if (!ledger) throw new Error("Withdraw request not found or already processed");

    const userId = ledger.userId;
    const amount = ledger.amount;

    const wallet = await ensureWallet(userId, session);
    // reduce pending
    wallet.pending = (wallet.pending || 0) - Number(amount);
    if (wallet.pending < 0) wallet.pending = 0;
    wallet.updatedAt = new Date();
    await wallet.save({ session });

    // update ledger status to completed and create a completed ledger entry
    ledger.status = "completed";
    ledger.note = ledger.note + " | approved: " + adminNote;
    await ledger.save({ session });

    const completedTxId = makeTxId("WOK");
    await WalletLedger.create([{
      userId,
      txId: completedTxId,
      type: "debit",
      category: "withdraw",
      amount: Number(amount),
      balanceAfter: wallet.balance,
      status: "completed",
      ref: ledger._id,
      note: "Withdraw approved"
    }], { session });

    // update transaction record
    await Transaction.findOneAndUpdate({ txId }, { $set: { status: "completed", updatedAt: new Date() } }, { session });

    await session.commitTransaction();
    session.endSession();

    return { txId: completedTxId, balance: wallet.balance };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

// Get wallet summary + ledger (pagination)
export async function getWalletSummary(userId, { limit = 50, skip = 0 } = {}) {
  const wallet = await Wallet.findOne({ user: userId }).lean();
  const ledger = await WalletLedger.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
  return { wallet: wallet || { balance: 0, pending: 0 }, ledger };
}

// Admin: direct credit (for bonuses, adjustments)
export async function adminCredit(userId, amount, category = "admin", note = "") {
  return credit(userId, amount, category, null, note);
}

export default {
  credit,
  debit,
  createWithdrawRequest,
  adminApproveWithdraw,
  getWalletSummary,
  adminCredit
};
