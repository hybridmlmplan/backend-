// backend/scripts/fundEngine.js
// Fund engine — monthly/annual fund pool calculation & distribution
// Matches FINAL plan:
// - Car Fund: monthly 2% pool (Ruby Star & above eligible)
// - House Fund: monthly 2% pool (Diamond Star & above eligible)
// - Travel Fund: yearly allocations (Ruby Star -> national, Diamond -> international)
// - All fund amounts come only from BV (repurchase/product BV)
// - Atomic updates with mongoose transactions

import mongoose from "mongoose";
import FundPool from "../models/FundPool.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import WalletLedger from "../models/WalletLedger.js";
import BVLedger from "../models/BVLedger.js"; // if needed to compute monthly BV

// Configurable percentages (as per plan)
const CAR_FUND_PERCENT = 2;    // monthly percent of company BV
const HOUSE_FUND_PERCENT = 2;  // monthly percent of company BV
// Travel fund handled separately (yearly, may be fixed or percent-based)
const TRAVEL_FUND_PERCENT = 0; // 0 -> handle via admin-set total

// Rank order helper (lower index = lower rank)
const RANK_PRIORITY = [
  "star",
  "silver_star",
  "gold_star",
  "ruby_star",
  "emerald_star",
  "diamond_star",
  "crown_star",
  "ambassador_star",
  "company_star"
];

// helper: check if user's rank is >= required rank
function rankAtLeast(userRank, requiredRankKey) {
  if (!userRank) return false;
  const idxUser = RANK_PRIORITY.indexOf(userRank);
  const idxReq = RANK_PRIORITY.indexOf(requiredRankKey);
  if (idxUser === -1 || idxReq === -1) return false;
  return idxUser >= idxReq;
}

/**
 * creditFundBV
 * Add BV amount to the company's fund pool (this is called when repurchase BV happens).
 * Saves monthlyBV and totalBV counters to FundPool for later distribution.
 *
 * @param {Number} bvAmount  - positive BV amount
 * @param {Object} meta - optional { source, orderId, monthKey } ; monthKey like '2025-12'
 */
export async function creditFundBV(bvAmount, meta = {}) {
  if (!bvAmount || typeof bvAmount !== "number" || bvAmount <= 0) return null;

  const monthKey = meta.monthKey || (new Date()).toISOString().slice(0,7); // YYYY-MM
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const update = {
      $inc: {
        totalBV: bvAmount,
        [`monthlyBV.${monthKey}`]: bvAmount
      },
      $set: { updatedAt: new Date() }
    };

    const pool = await FundPool.findOneAndUpdate({}, update, { upsert: true, new: true, session });
    await session.commitTransaction();
    session.endSession();
    return pool;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("creditFundBV error:", err);
    throw err;
  }
}

/**
 * distributeMonthlyFunds
 * Calculates Car Fund and House Fund for the given monthKey (YYYY-MM)
 * and distributes to eligible users proportionally (equal share per eligible user).
 *
 * @param {String} monthKey - 'YYYY-MM' (defaults to current month)
 * @returns {Object} summary
 */
export async function distributeMonthlyFunds(monthKey = null) {
  const key = monthKey || (new Date()).toISOString().slice(0,7);
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const pool = await FundPool.findOne({}, null, { session });
    const monthlyBV = (pool && pool.monthlyBV && pool.monthlyBV[key]) ? pool.monthlyBV[key] : 0;

    // Calculate fund amounts
    const carPoolAmount = (monthlyBV * CAR_FUND_PERCENT) / 100;
    const housePoolAmount = (monthlyBV * HOUSE_FUND_PERCENT) / 100;

    // Fetch eligible users
    const carEligible = await User.find({ rank: { $in: RANK_PRIORITY.slice(RANK_PRIORITY.indexOf("ruby_star")) } }, null, { session }).lean();
    const houseEligible = await User.find({ rank: { $in: RANK_PRIORITY.slice(RANK_PRIORITY.indexOf("diamond_star")) } }, null, { session }).lean();

    // Distribute equally among eligible users (business rule). Alternative: proportional to rank weight (can be added).
    const carCount = carEligible.length || 0;
    const houseCount = houseEligible.length || 0;

    const perCar = carCount > 0 ? +(carPoolAmount / carCount).toFixed(2) : 0;
    const perHouse = houseCount > 0 ? +(housePoolAmount / houseCount).toFixed(2) : 0;

    const distributions = {
      month: key,
      carPoolAmount,
      housePoolAmount,
      carDistributed: 0,
      houseDistributed: 0,
      carCount,
      houseCount
    };

    // Distribute car fund
    for (const u of carEligible) {
      if (perCar <= 0) break;
      await Wallet.findOneAndUpdate({ user: u._id }, { $inc: { balance: perCar } }, { upsert: true, session });
      await WalletLedger.create([{
        userId: u._id,
        amount: perCar,
        type: "fund_car",
        note: `Car Fund (${key})`,
        date: new Date()
      }], { session });
      distributions.carDistributed += perCar;
    }

    // Distribute house fund
    for (const u of houseEligible) {
      if (perHouse <= 0) break;
      await Wallet.findOneAndUpdate({ user: u._id }, { $inc: { balance: perHouse } }, { upsert: true, session });
      await WalletLedger.create([{
        userId: u._id,
        amount: perHouse,
        type: "fund_house",
        note: `House Fund (${key})`,
        date: new Date()
      }], { session });
      distributions.houseDistributed += perHouse;
    }

    // Record distribution summary in FundPool distributions log
    await FundPool.findOneAndUpdate({}, {
      $push: {
        distributions: {
          month: key,
          carPoolAmount,
          housePoolAmount,
          carDistributed: distributions.carDistributed,
          houseDistributed: distributions.houseDistributed,
          carCount,
          houseCount,
          createdAt: new Date()
        }
      },
      $set: { updatedAt: new Date() }
    }, { upsert: true, session });

    await session.commitTransaction();
    session.endSession();
    return { status: true, distributions };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("distributeMonthlyFunds error:", err);
    return { status: false, error: err.message };
  }
}

/**
 * allocateYearlyTravelFund
 * Admin-triggered: allocate yearly travel fund pool to winners/eligible lists.
 * This function expects `totalTravelFund` precomputed (e.g., admin decides from CTO BV or percent).
 *
 * Rules per plan:
 * - Ruby Star & above -> national tour eligibility
 * - Diamond Star & above -> international tour eligibility
 *
 * This function simply records the allocation and can credit winners (admin decides winners).
 *
 * @param {Number} totalTravelFund
 * @param {Object} opts { year: 2025, nationalShare: 0.6, internationalShare: 0.4 }
 */
export async function allocateYearlyTravelFund(totalTravelFund = 0, opts = {}) {
  const year = opts.year || (new Date()).getFullYear();
  const nationalShare = typeof opts.nationalShare === "number" ? opts.nationalShare : 0.6;
  const internationalShare = typeof opts.internationalShare === "number" ? opts.internationalShare : 0.4;

  if (!totalTravelFund || totalTravelFund <= 0) {
    return { status: false, message: "No travel fund to allocate" };
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const nationalPool = +(totalTravelFund * nationalShare).toFixed(2);
    const internationalPool = +(totalTravelFund * internationalShare).toFixed(2);

    // Store allocation record in FundPool
    await FundPool.findOneAndUpdate({}, {
      $push: {
        travelAllocations: {
          year,
          totalTravelFund,
          nationalPool,
          internationalPool,
          createdAt: new Date()
        }
      },
      $set: { updatedAt: new Date() }
    }, { upsert: true, session });

    await session.commitTransaction();
    session.endSession();
    return { status: true, year, nationalPool, internationalPool };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("allocateYearlyTravelFund error:", err);
    return { status: false, error: err.message };
  }
}

/**
 * quick helper: get FundPool summary
 */
export async function getFundSummary() {
  const pool = await FundPool.findOne().lean();
  return pool || { totalBV: 0, monthlyBV: {}, distributions: [], travelAllocations: [] };
}

export default {
  creditFundBV,
  distributeMonthlyFunds,
  allocateYearlyTravelFund,
  getFundSummary
};
