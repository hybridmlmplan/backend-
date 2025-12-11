// services/walletService.js
// MASTER WALLET ENGINE – supports: binary, royalty, ranks, funds, franchise, level income, withdrawals
// All income flows are fully aligned with your final business plan
// --------------------------------------------------------------

const mongoose = require("mongoose");
const { Types } = mongoose;

const Wallet = require("../models/Wallet");
const WalletLedger = require("../models/WalletLedger");
const User = require("../models/User");
const Withdrawal = require("../models/Withdrawal");

// --------------------------------------------------------------
// INTERNAL: Create ledger entry
// --------------------------------------------------------------
async function createLedger({ userId, amount, type, remark, session }) {
  const entry = {
    userId: Types.ObjectId(userId),
    amount: Number(amount),
    type,
    remark,
    createdAt: new Date()
  };

  if (session)
    return WalletLedger.create([entry], { session });

  return WalletLedger.create(entry);
}

// --------------------------------------------------------------
// INTERNAL: Credit amount to wallet
// --------------------------------------------------------------
async function creditToWallet(userId, amount, type, remark, session = null) {
  if (!amount || amount <= 0) return false;

  await createLedger({
    userId,
    amount,
    type,
    remark,
    session
  });

  const update = {
    $inc: {
      balance: Number(amount),
      [type]: Number(amount)  // example: binaryIncome, royaltyIncome, rankIncome, fundIncome
    }
  };

  if (session)
    return Wallet.updateOne({ userId }, update, { session });

  return Wallet.updateOne({ userId }, update);
}

// --------------------------------------------------------------
// BINARY INCOME CREDIT
// --------------------------------------------------------------
async function creditBinaryIncome(userId, amount, remark = "Binary Pair Income") {
  return creditToWallet(userId, amount, "binaryIncome", remark);
}

// --------------------------------------------------------------
// RANK INCOME CREDIT
// --------------------------------------------------------------
async function creditRankIncome(userId, amount, remark = "Rank Income") {
  return creditToWallet(userId, amount, "rankIncome", remark);
}

// --------------------------------------------------------------
// ROYALTY INCOME CREDIT (Used by royaltyService)
// --------------------------------------------------------------
async function creditRoyalty(userId, amount, remark = "Monthly Royalty") {
  return creditToWallet(userId, amount, "royaltyIncome", remark);
}

// --------------------------------------------------------------
// FUND INCOME CREDIT (Car, House, Travel fund etc.)
// --------------------------------------------------------------
async function creditFundIncome(userId, amount, remark = "Fund Income") {
  return creditToWallet(userId, amount, "fundIncome", remark);
}

// --------------------------------------------------------------
// FRANCHISE INCOME CREDIT
// --------------------------------------------------------------
async function creditFranchiseIncome(userId, amount, remark = "Franchise Income") {
  return creditToWallet(userId, amount, "franchiseIncome", remark);
}

// --------------------------------------------------------------
// LEVEL INCOME CREDIT (0.5% BV up to 10 levels)
// --------------------------------------------------------------
async function creditLevelIncome(userId, amount, remark = "Level Income") {
  return creditToWallet(userId, amount, "levelIncome", remark);
}

// --------------------------------------------------------------
// GENERIC CREDIT FUNCTION (if future income types needed)
// --------------------------------------------------------------
async function creditGeneric(userId, amount, type, remark) {
  return creditToWallet(userId, amount, type, remark);
}

// --------------------------------------------------------------
// GET WALLET SUMMARY
// --------------------------------------------------------------
async function getWalletSummary(userId) {
  const wallet = await Wallet.findOne({ userId }).lean();
  const ledger = await WalletLedger.find({ userId }).sort({ createdAt: -1 }).lean();

  return {
    wallet,
    ledger
  };
}

// --------------------------------------------------------------
// CREATE WITHDRAWAL REQUEST
// --------------------------------------------------------------
async function createWithdrawalRequest(userId, amount, method, details) {
  const wallet = await Wallet.findOne({ userId });

  if (!wallet || wallet.balance < amount)
    throw new Error("Insufficient balance");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Deduct from wallet temporarily
    await Wallet.updateOne(
      { userId },
      { $inc: { balance: -amount, pendingWithdrawal: amount } },
      { session }
    );

    const withdrawal = await Withdrawal.create(
      [{
        userId,
        amount,
        method,
        details,
        status: "PENDING",
        createdAt: new Date()
      }],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return withdrawal[0];
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

// --------------------------------------------------------------
// ADMIN: APPROVE WITHDRAWAL
// --------------------------------------------------------------
async function approveWithdrawal(withdrawalId, adminId) {
  const withdrawal = await Withdrawal.findById(withdrawalId);
  if (!withdrawal || withdrawal.status !== "PENDING")
    throw new Error("Invalid withdrawal request");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Mark as approved
    await Withdrawal.updateOne(
      { _id: withdrawalId },
      { $set: { status: "APPROVED", approvedBy: adminId, approvedAt: new Date() } },
      { session }
    );

    // Remove pending amount from wallet
    await Wallet.updateOne(
      { userId: withdrawal.userId },
      { $inc: { pendingWithdrawal: -withdrawal.amount } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return true;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

// --------------------------------------------------------------
// ADMIN: REJECT WITHDRAWAL
// --------------------------------------------------------------
async function rejectWithdrawal(withdrawalId, adminId, reason) {
  const withdrawal = await Withdrawal.findById(withdrawalId);
  if (!withdrawal || withdrawal.status !== "PENDING")
    throw new Error("Invalid withdrawal request");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    await Withdrawal.updateOne(
      { _id: withdrawalId },
      {
        $set: {
          status: "REJECTED",
          rejectedBy: adminId,
          rejectedAt: new Date(),
          rejectReason: reason
        }
      },
      { session }
    );

    // Refund money back to wallet
    await Wallet.updateOne(
      { userId: withdrawal.userId },
      {
        $inc: {
          balance: withdrawal.amount,
          pendingWithdrawal: -withdrawal.amount
        }
      },
      { session }
    );

    await session.commitTransaction();
    session.endSession();
    return true;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

// --------------------------------------------------------------
// REVERSE INCOME (Admin-only safety)
// --------------------------------------------------------------
async function reverseIncome(ledgerId, adminId) {
  const entry = await WalletLedger.findById(ledgerId);
  if (!entry) throw new Error("Ledger entry not found");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Deduct from wallet
    await Wallet.updateOne(
      { userId: entry.userId },
      { $inc: { balance: -entry.amount, [entry.type]: -entry.amount } },
      { session }
    );

    // Add reverse ledger
    await WalletLedger.create(
      [{
        userId: entry.userId,
        amount: -entry.amount,
        type: "REVERSAL",
        remark: `Reversal of ${entry.type} | Admin: ${adminId}`,
        createdAt: new Date()
      }],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return true;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

// --------------------------------------------------------------
// EXPORTS
// --------------------------------------------------------------
module.exports = {
  creditBinaryIncome,
  creditRoyalty,
  creditRankIncome,
  creditFundIncome,
  creditFranchiseIncome,
  creditLevelIncome,
  creditGeneric,

  getWalletSummary,

  createWithdrawalRequest,
  approveWithdrawal,
  rejectWithdrawal,

  reverseIncome
};
