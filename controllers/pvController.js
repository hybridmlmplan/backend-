// controllers/pvController.js
const mongoose = require("mongoose");
const PVHistory = require("../models/PVHistory");
const User = require("../models/User");
const Wallet = require("../models/wallets"); // your model file is wallets.js

/**
 * GET /pv/:userId
 * Return PV entries and aggregated total PV (excluding void entries)
 */
exports.getUserPV = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }

    const totalAgg = await PVHistory.aggregate([
      {
        $match: {
          user: mongoose.Types.ObjectId(userId),
          status: { $ne: "void" },
        },
      },
      { $group: { _id: null, totalPV: { $sum: "$pv" } } },
    ]);

    const totalPV = (totalAgg[0] && totalAgg[0].totalPV) || 0;

    const entries = await PVHistory.find({ user: userId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, totalPV, entries });
  } catch (err) {
    console.error("getUserPV error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * POST /pv/credit
 * Body: { userId, pv, source, remark }
 * Creates a PVHistory credit entry and (optionally) updates user PV summary in User model if you keep that.
 */
exports.creditPV = async (req, res) => {
  try {
    const { userId, pv, source, remark } = req.body;

    if (!userId || typeof pv === "undefined") {
      return res
        .status(400)
        .json({ success: false, message: "userId and pv are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid userId" });
    }

    const numericPV = Number(pv);
    if (isNaN(numericPV)) {
      return res
        .status(400)
        .json({ success: false, message: "pv must be a number" });
    }

    // Create PVHistory entry
    const entry = await PVHistory.create({
      user: userId,
      pv: Math.abs(numericPV),
      type: "credit",
      source: source || "admin_credit",
      remark,
      status: "confirmed",
      createdBy: req.user ? req.user._id : null,
    });

    // Optional: update a PV summary on User (if your User model has pv field)
    try {
      await User.findByIdAndUpdate(
        userId,
        { $inc: { pv: Math.abs(numericPV) } },
        { new: true }
      );
    } catch (e) {
      // not fatal — PVHistory created; log and continue
      console.warn("Unable to update User.pv (maybe field missing):", e.message);
    }

    return res.json({ success: true, entry });
  } catch (err) {
    console.error("creditPV error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * POST /pv/debit
 * Body: { userId, pv, remark }
 * Creates a PVHistory debit entry (negative PV) and decrements user's pv summary if exists.
 */
exports.debitPV = async (req, res) => {
  try {
    const { userId, pv, remark } = req.body;

    if (!userId || typeof pv === "undefined") {
      return res
        .status(400)
        .json({ success: false, message: "userId and pv are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid userId" });
    }

    const numericPV = Number(pv);
    if (isNaN(numericPV)) {
      return res
        .status(400)
        .json({ success: false, message: "pv must be a number" });
    }

    // Create negative PV record
    const entry = await PVHistory.create({
      user: userId,
      pv: -Math.abs(numericPV),
      type: "debit",
      source: "admin_debit",
      remark,
      status: "confirmed",
      createdBy: req.user ? req.user._id : null,
    });

    // Optional: decrement User.pv if field exists
    try {
      await User.findByIdAndUpdate(
        userId,
        { $inc: { pv: -Math.abs(numericPV) } },
        { new: true }
      );
    } catch (e) {
      console.warn("Unable to update User.pv (maybe field missing):", e.message);
    }

    return res.json({ success: true, entry });
  } catch (err) {
    console.error("debitPV error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Optional helper: get system-wide PV stats
 * GET /pv/stats
 */
exports.getPVStats = async (req, res) => {
  try {
    const agg = await PVHistory.aggregate([
      { $match: { status: { $ne: "void" } } },
      { $group: { _id: null, totalPV: { $sum: "$pv" }, count: { $sum: 1 } } },
    ]);

    return res.json({
      success: true,
      totalPV: agg[0] ? agg[0].totalPV : 0,
      totalEntries: agg[0] ? agg[0].count : 0,
    });
  } catch (err) {
    console.error("getPVStats error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
