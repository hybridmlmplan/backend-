import BVHistory from "../models/BVHistory.js";
const User = require("../models/User");
const BVHistory = require("../models/BVHistory");
const PVHistory = require("../models/PVHistory");
const PairEngine = require("../utils/pairengine");

// ======================
// 1) DIRECT INCOME
// ======================
exports.getDirectIncome = async (req, res) => {
  try {
    const userId = req.params.userId;

    const directIncome = await BVHistory.find({
      user: userId,
      type: "direct"
    }).sort({ createdAt: -1 });

    const total = directIncome.reduce((a, b) => a + b.amount, 0);

    return res.json({ total, entries: directIncome });
  } catch (err) {
    console.error("Direct Income Error:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};

// ======================
// 2) LEVEL INCOME
// ======================
exports.getLevelIncome = async (req, res) => {
  try {
    const userId = req.params.userId;

    const entries = await BVHistory.find({
      user: userId,
      type: "level"
    }).sort({ createdAt: -1 });

    const total = entries.reduce((a, b) => a + b.amount, 0);

    return res.json({ total, entries });
  } catch (err) {
    console.error("Level Income Error:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};

// ======================
// 3) BINARY INCOME
// ======================
exports.getBinaryIncome = async (req, res) => {
  try {
    const userId = req.params.userId;

    const entries = await BVHistory.find({
      user: userId,
      type: "binary"
    }).sort({ createdAt: -1 });

    const total = entries.reduce((a, b) => a + b.amount, 0);

    return res.json({ total, entries });
  } catch (err) {
    console.error("Binary Income Error:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};

// ======================
// 4) MATCHING INCOME
// ======================
exports.getMatchingIncome = async (req, res) => {
  try {
    const userId = req.params.userId;

    const entries = await BVHistory.find({
      user: userId,
      type: "matching"
    }).sort({ createdAt: -1 });

    const total = entries.reduce((a, b) => a + b.amount, 0);

    return res.json({ total, entries });
  } catch (err) {
    console.error("Matching Income Error:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};

// ======================
// 5) ROYALTY INCOME
// ======================
exports.getRoyaltyIncome = async (req, res) => {
  try {
    const userId = req.params.userId;

    const entries = await BVHistory.find({
      user: userId,
      type: "royalty"
    }).sort({ createdAt: -1 });

    const total = entries.reduce((a, b) => a + b.amount, 0);

    return res.json({ total, entries });
  } catch (err) {
    console.error("Royalty Income Error:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};

// ======================
// 6) FUND INCOME / REPURCHASE
// ======================
exports.getFundIncome = async (req, res) => {
  try {
    const userId = req.params.userId;

    const entries = await BVHistory.find({
      user: userId,
      type: "fund"
    }).sort({ createdAt: -1 });

    const total = entries.reduce((a, b) => a + b.amount, 0);

    return res.json({ total, entries });
  } catch (err) {
    console.error("Fund Income Error:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};
