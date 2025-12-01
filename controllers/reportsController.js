const User = require("../models/User");
const Wallet = require("../models/Wallet");
const PV = require("../models/PV");
const Franchise = require("../models/Franchise");
const Income = require("../models/Income");

// ------------------------------------------------------
// 1. Member List Report
// ------------------------------------------------------
exports.memberReport = async (req, res) => {
  try {
    const users = await User.find().select("-password");

    res.json({
      status: true,
      message: "Member report fetched successfully",
      data: users,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// ------------------------------------------------------
// 2. PV Report
// ------------------------------------------------------
exports.pvReport = async (req, res) => {
  try {
    const pv = await PV.find();

    res.json({
      status: true,
      message: "PV report fetched successfully",
      data: pv,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// ------------------------------------------------------
// 3. Income Report
// ------------------------------------------------------
exports.incomeReport = async (req, res) => {
  try {
    const income = await Income.find();

    res.json({
      status: true,
      message: "Income report fetched successfully",
      data: income,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// ------------------------------------------------------
// 4. Wallet Transaction Report
// ------------------------------------------------------
exports.walletReport = async (req, res) => {
  try {
    const wallet = await Wallet.find();

    res.json({
      status: true,
      message: "Wallet report fetched",
      data: wallet,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// ------------------------------------------------------
// 5. Franchise Report
// ------------------------------------------------------
exports.franchiseReport = async (req, res) => {
  try {
    const franchise = await Franchise.find();

    res.json({
      status: true,
      message: "Franchise report fetched successfully",
      data: franchise,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
