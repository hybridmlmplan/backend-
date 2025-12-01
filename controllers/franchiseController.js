const User = require("../models/User");
const Wallet = require("../models/wallets");
const Epin = require("../models/Epin");
const Purchase = require("../models/Purchase");

// ===============================
// 1) Franchise PROFILE
// ===============================
exports.getFranchiseProfile = async (req, res) => {
  try {
    const franchiseId = req.params.id;

    const profile = await User.findById(franchiseId).select(
      "-password -otp -tokens"
    );

    if (!profile) {
      return res.status(404).json({ message: "Franchise not found" });
    }

    return res.json(profile);
  } catch (err) {
    console.error("Franchise Profile Error:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};

// ===============================
// 2) Franchise UPDATE PROFILE
// ===============================
exports.updateFranchiseProfile = async (req, res) => {
  try {
    const franchiseId = req.params.id;
    const updates = req.body;

    const updated = await User.findByIdAndUpdate(franchiseId, updates, {
      new: true,
    });

    return res.json({ message: "Profile updated", updated });
  } catch (err) {
    console.error("Update Franchise Error:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};

// ===============================
// 3) Franchise WALLET DETAILS
// ===============================
exports.getFranchiseWallet = async (req, res) => {
  try {
    const franchiseId = req.params.id;

    const wallet = await Wallet.findOne({ userId: franchiseId });

    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    return res.json(wallet);
  } catch (err) {
    console.error("Franchise Wallet Error:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};

// ===============================
// 4) Franchise USERS LIST
// ===============================
exports.getFranchiseUsers = async (req, res) => {
  try {
    const franchiseId = req.params.id;

    const users = await User.find({ franchise: franchiseId }).select(
      "name email mobile username package left right createdAt"
    );

    return res.json(users);
  } catch (err) {
    console.error("Franchise Users Error:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};

// ===============================
// 5) Franchise EPIN SUMMARY
// ===============================
exports.getFranchiseEpinSummary = async (req, res) => {
  try {
    const franchiseId = req.params.id;

    const totalPins = await Epin.find({ createdBy: franchiseId }).count();
    const usedPins = await Epin.find({ createdBy: franchiseId, status: "used" }).count();
    const unusedPins = totalPins - usedPins;

    return res.json({
      totalPins,
      usedPins,
      unusedPins,
    });
  } catch (err) {
    console.error("Franchise Epin Summary Error:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};

// ===============================
// 6) Franchise SALES / PURCHASE LIST
// ===============================
exports.getFranchiseSales = async (req, res) => {
  try {
    const franchiseId = req.params.id;

    const sales = await Purchase.find({ franchiseId }).sort({ createdAt: -1 });

    return res.json(sales);
  } catch (err) {
    console.error("Franchise Sales Error:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};

// ===============================
// 7) Franchise LEDGER (Wallet History)
// ===============================
exports.getFranchiseLedger = async (req, res) => {
  try {
    const franchiseId = req.params.id;

    const wallet = await Wallet.findOne({ userId: franchiseId });

    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    return res.json(wallet.history.reverse());
  } catch (err) {
    console.error("Franchise Ledger Error:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};
