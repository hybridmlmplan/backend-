// ======================================================
// WALLET CONTROLLER (MASTER ENGINE) – FINAL VERSION
// For Hybrid MLM Plan (PV Binary + BV Income System)
// ======================================================

import Wallet from "../models/Wallet.js";
import User from "../models/User.js";
import { addLedgerEntry } from "../services/walletService.js";
import { calculateRankIncome } from "../services/rankService.js";
import { calculateRoyalty } from "../services/royaltyService.js";
import { calculateLevelIncome } from "../services/levelService.js";
import { calculateFundIncome } from "../services/fundService.js";

// ======================================================
// GET USER WALLET
// ======================================================
export const getWallet = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ userId: req.user.id });

    if (!wallet) {
      return res.status(404).json({ status: false, message: "Wallet not found" });
    }

    res.json({ status: true, data: wallet });
  } catch (err) {
    console.error("Get Wallet Error:", err);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

// ======================================================
// ADD INCOME (USED INTERNALLY BY ALL SERVICES)
// ======================================================
export const creditIncome = async ({
  userId,
  amount,
  type,
  remark = "",
  sessionId = null,
  bv = 0,
  pv = 0
}) => {
  try {
    let wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      wallet = await Wallet.create({ userId, balance: 0 });
    }

    wallet.balance += Number(amount);

    await wallet.save();

    await addLedgerEntry({
      userId,
      amount,
      type,
      remark,
      sessionId,
      bv,
      pv,
      direction: "credit"
    });

    return true;
  } catch (err) {
    console.error("creditIncome Error:", err);
    return false;
  }
};

// ======================================================
// DEBIT WALLET (Withdraw/Transfer)
// ======================================================
export const debitWallet = async (req, res) => {
  try {
    const { amount, remark } = req.body;

    let wallet = await Wallet.findOne({ userId: req.user.id });

    if (!wallet || wallet.balance < Number(amount)) {
      return res.status(400).json({ status: false, message: "Insufficient balance" });
    }

    wallet.balance -= Number(amount);
    await wallet.save();

    await addLedgerEntry({
      userId: req.user.id,
      amount,
      type: "debit",
      remark,
      direction: "debit"
    });

    res.json({ status: true, message: "Debit successful" });
  } catch (err) {
    console.error("debitWallet Error:", err);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

// ======================================================
// TRANSFER WALLET BALANCE USER → USER
// ======================================================
export const transferBalance = async (req, res) => {
  try {
    const { receiverId, amount } = req.body;

    const senderWallet = await Wallet.findOne({ userId: req.user.id });
    const receiverWallet = await Wallet.findOne({ userId: receiverId });

    if (!receiverWallet) {
      return res.status(400).json({ status: false, message: "Receiver wallet not found" });
    }

    if (senderWallet.balance < amount) {
      return res.status(400).json({ status: false, message: "Insufficient balance" });
    }

    senderWallet.balance -= amount;
    receiverWallet.balance += amount;

    await senderWallet.save();
    await receiverWallet.save();

    await addLedgerEntry({
      userId: req.user.id,
      amount,
      type: "transfer-debit",
      remark: `Transfer to ${receiverId}`,
      direction: "debit"
    });

    await addLedgerEntry({
      userId: receiverId,
      amount,
      type: "transfer-credit",
      remark: `Received from ${req.user.id}`,
      direction: "credit"
    });

    res.json({ status: true, message: "Transfer successful" });
  } catch (err) {
    console.error("transferBalance Error:", err);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

// ======================================================
// RELEASE ALL BV-BASED INCOMES (Rank, Royalty, Level, Funds)
// Called after each BV transaction
// ======================================================
export const processBVIncome = async ({ userId, bv }) => {
  try {
    // RANK INCOME (सारे रैंक lifetime चलेंगे)
    await calculateRankIncome(userId, bv, creditIncome);

    // ROYALTY (Silver रैंकों को continuous)
    await calculateRoyalty(userId, bv, creditIncome);

    // LEVEL INCOME (1–10 levels 0.5% BV)
    await calculateLevelIncome(userId, bv, creditIncome);

    // FUND INCOME (Car, House, Travel)
    await calculateFundIncome(userId, bv, creditIncome);

    return true;
  } catch (err) {
    console.error("processBVIncome Error:", err);
    return false;
  }
};

// ======================================================
// ADD BV FROM SALE / REPURCHASE
// ======================================================
export const addBV = async (req, res) => {
  try {
    const { userId, bv } = req.body;

    if (!bv || bv <= 0) {
      return res.status(400).json({ status: false, message: "Invalid BV amount" });
    }

    await processBVIncome({ userId, bv });

    res.json({ status: true, message: "BV processed successfully" });
  } catch (err) {
    console.error("addBV Error:", err);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

// ======================================================
// TRANSACTION HISTORY
// ======================================================
export const getLedger = async (req, res) => {
  try {
    const entries = await Ledger.find({ userId: req.user.id }).sort({ createdAt: -1 });

    res.json({ status: true, data: entries });
  } catch (err) {
    console.error("getLedger Error:", err);
    res.status(500).json({ status: false, message: "Server error" });
  }
};
