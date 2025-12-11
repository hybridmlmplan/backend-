// =======================================================================
// FUND CONTROLLER – FINAL VERSION (CAR FUND, HOUSE FUND, TRAVEL FUND)
// =======================================================================

import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import FundPool from "../models/FundPool.js"; // monthly pool collection
import RankHistory from "../models/RankHistory.js";

// ---------- UTILITY: CREDIT INCOME TO WALLET ----------
const creditFundIncome = async (userId, amount, type) => {
  if (!amount || amount <= 0) return;

  await Wallet.findOneAndUpdate(
    { userId },
    {
      $inc: {
        [`${type}Income`]: amount,
        mainBalance: amount,
      },
    },
    { upsert: true, new: true }
  );
};

// ---------- GET ELIGIBLE USERS BASED ON RANK ----------
const getEligibleUsers = async (minRank) => {
  const ranks = [
    "Star",
    "Silver Star",
    "Gold Star",
    "Ruby Star",
    "Emerald Star",
    "Diamond Star",
    "Crown Star",
    "Ambassador Star",
    "Company Star",
  ];

  const index = ranks.indexOf(minRank);
  const allowedRanks = ranks.slice(index);

  return await User.find({ currentRank: { $in: allowedRanks } });
};

// =======================================================================
// 1. ADD BV TO MONTHLY POOL (Called After Every BV Transaction)
// =======================================================================
export const addBVToFundPool = async (req, res) => {
  try {
    const { bv } = req.body;
    if (!bv || bv <= 0)
      return res.status(400).json({ status: false, message: "Invalid BV" });

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const pool = await FundPool.findOneAndUpdate(
      { month: currentMonth, year: currentYear },
      {
        $inc: {
          carFundBV: bv * 0.02, // 2% car fund
          houseFundBV: bv * 0.02, // 2% house fund
          travelFundBV: bv * 0.01, // travel fund logic flexible
        },
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      status: true,
      message: "BV added to fund pool",
      pool,
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: err.message });
  }
};

// =======================================================================
// 2. DISTRIBUTE CAR FUND (MONTHLY)
// =======================================================================
export const distributeCarFund = async (req, res) => {
  try {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const pool = await FundPool.findOne({
      month: currentMonth,
      year: currentYear,
    });

    if (!pool || pool.carFundBV <= 0)
      return res.status(400).json({
        status: false,
        message: "No car fund available for this month",
      });

    const eligible = await getEligibleUsers("Ruby Star"); // Ruby Star & above
    if (!eligible.length)
      return res.status(400).json({
        status: false,
        message: "No eligible users for Car Fund",
      });

    const share = pool.carFundBV / eligible.length;

    for (const user of eligible) {
      await creditFundIncome(user.userId, share, "carFund");
    }

    pool.carFundBV = 0;
    await pool.save();

    return res.status(200).json({
      status: true,
      message: "Car Fund distributed successfully",
      perUser: share,
      totalUsers: eligible.length,
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: err.message });
  }
};

// =======================================================================
// 3. DISTRIBUTE HOUSE FUND (MONTHLY)
// =======================================================================
export const distributeHouseFund = async (req, res) => {
  try {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const pool = await FundPool.findOne({
      month: currentMonth,
      year: currentYear,
    });

    if (!pool || pool.houseFundBV <= 0)
      return res.status(400).json({
        status: false,
        message: "No house fund available for this month",
      });

    const eligible = await getEligibleUsers("Diamond Star"); // Diamond Star & above

    if (!eligible.length)
      return res.status(400).json({
        status: false,
        message: "No eligible users for House Fund",
      });

    const share = pool.houseFundBV / eligible.length;

    for (const user of eligible) {
      await creditFundIncome(user.userId, share, "houseFund");
    }

    pool.houseFundBV = 0;
    await pool.save();

    return res.status(200).json({
      status: true,
      message: "House Fund distributed successfully",
      perUser: share,
      totalUsers: eligible.length,
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: err.message });
  }
};

// =======================================================================
// 4. DISTRIBUTE TRAVEL FUND (YEARLY)
// =======================================================================
export const distributeTravelFund = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();

    const pool = await FundPool.findOne({
      year: currentYear,
    });

    if (!pool || pool.travelFundBV <= 0)
      return res.status(400).json({
        status: false,
        message: "No travel fund available for this year",
      });

    const eligible = await getEligibleUsers("Ruby Star"); // Ruby Star & above

    if (!eligible.length)
      return res.status(400).json({
        status: false,
        message: "No eligible users for Travel Fund",
      });

    const share = pool.travelFundBV / eligible.length;

    for (const user of eligible) {
      await creditFundIncome(user.userId, share, "travelFund");
    }

    pool.travelFundBV = 0;
    await pool.save();

    return res.status(200).json({
      status: true,
      message: "Travel Fund distributed successfully",
      perUser: share,
      totalUsers: eligible.length,
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: err.message });
  }
};

// =======================================================================
// 5. ADMIN – VIEW CURRENT POOL
// =======================================================================
export const getCurrentFundPool = async (req, res) => {
  try {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const pool = await FundPool.findOne({
      month: currentMonth,
      year: currentYear,
    });

    return res.status(200).json({
      status: true,
      data: pool || {},
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: err.message });
  }
};
