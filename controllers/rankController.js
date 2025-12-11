/**
 * controllers/rankController.js
 *
 * Rank controller for Hybrid MLM Plan (Dev ji)
 * - Auto-calculates user ranks based on pair counts (every 8 pairs => next rank)
 * - Credits rank income on upgrade (lifetime stacking: old incomes continue; we credit only the newly unlocked income)
 * - Idempotent: won't credit same rank twice
 * - Admin batch recalc, reports, manual set
 *
 * Assumptions:
 *  - Models: User, PVBVLedger (optional ledger), RankHistory (optional), Wallet (optional)
 *  - User schema includes:
 *      userId (string), packages: [{ packageId, packageName, pairsCompleted, sessionsCompleted, pv, active }],
 *      rankHistory: [{ packageType, rankIndex, rankName, amount, creditedAt }],
 *      currentRanks: { silver: rankIndex, gold: rankIndex, ruby: rankIndex }  // optional but helpful
 *  - walletService.credit(userId, amount, type, meta) is available; fallback to PVBVLedger
 *
 * Rank rule (configurable):
 *  - pairsPerRankStep: 8
 *  - Ranks per package and incomes as per final plan
 *
 * Endpoints:
 *  POST /rank/calc/:userId         -> Recalculate & apply to single user
 *  POST /rank/distribute           -> Admin: batch recalc for all users
 *  GET  /rank/user/:userId         -> Get user's rank & history
 *  GET  /rank/report               -> Admin: summary report
 *  POST /rank/set/:userId          -> Admin: manual set rank (for fixes)
 *
 * Author: ChatGPT (master mode) for Dev ji
 * Date: 2025-12-11
 */

import mongoose from "mongoose";

import User from "../models/User.js";
import PVBVLedger from "../models/PVBVLedger.js"; // fallback ledger model
// import RankHistory from "../models/RankHistory.js"; // optional
import * as walletService from "../services/walletService.js";
import { authenticate, isAdmin } from "../middlewares/auth.js"; // for route wiring if used directly

const rankController = {};

/* -----------------------
   Configuration: Rank arrays & incomes (stacking incomes)
   Use the incomes exactly as in plan.
   Index 0 = Star, 1 = Silver Star, 2 = Gold Star, ... upto Company Star
   ----------------------- */
const RANK_CONFIG = {
  pairsPerRankStep: 8, // every 8 pairs -> next rank step
  silver: {
    name: "Silver",
    incomes: [10, 20, 40, 80, 160, 320, 640, 1280, 2560], // Star -> Company Star
  },
  gold: {
    name: "Gold",
    incomes: [50, 100, 200, 400, 800, 1600, 3200, 6400, 12800],
  },
  ruby: {
    name: "Ruby",
    incomes: [500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000],
  },
};

/* -----------------------
   Helper: safe objectId
----------------------- */
function toObjectId(id) {
  try {
    return mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
}

/* -----------------------
   Helper: credit user with idempotency for rank income
   - We track credited ranks in user.rankHistory array.
   - If a (packageType, rankIndex) already exists in rankHistory, do not credit again.
----------------------- */
async function creditRankIncomeIfNew(user, packageType, rankIndex, amount) {
  if (!user || !user._id) throw new Error("Invalid user for credit");

  // ensure rankHistory exists
  user.rankHistory = user.rankHistory || [];

  const already = user.rankHistory.find(
    (r) => r.packageType === packageType && Number(r.rankIndex) === Number(rankIndex)
  );
  if (already) {
    // already credited previously
    return { credited: false, reason: "already_credited" };
  }

  // credit via walletService if available
  try {
    if (typeof walletService.credit === "function") {
      await walletService.credit(user._id, amount, "rank_income", {
        packageType,
        rankIndex,
        rankName: RANK_CONFIG[packageType].incomes[rankIndex] !== undefined ? `${packageType} rank ${rankIndex}` : "",
      });
    } else {
      // fallback create PVBVLedger entry (amount is cash)
      if (PVBVLedger) {
        await PVBVLedger.create({
          user: user._id,
          bv: 0,
          pv: 0,
          cash: amount,
          type: "RANK_INCOME",
          meta: { packageType, rankIndex },
          createdAt: new Date(),
        });
      }
    }
  } catch (e) {
    console.error("creditRankIncomeIfNew: walletService failed ->", e.message);
    throw e;
  }

  // record in rankHistory on user doc (we will save outside)
  user.rankHistory.push({
    packageType,
    rankIndex,
    rankName: RANK_CONFIG[packageType].incomes[rankIndex] !== undefined ? getRankName(packageType, rankIndex) : `Rank-${rankIndex}`,
    amount,
    creditedAt: new Date(),
  });

  return { credited: true };
}

/* -----------------------
   Helper: get rank name (human friendly)
----------------------- */
function getRankName(packageType, index) {
  const names = ["Star", "Silver Star", "Gold Star", "Ruby Star", "Emerald Star", "Diamond Star", "Crown Star", "Ambassador Star", "Company Star"];
  return names[index] || `Rank-${index}`;
}

/* -----------------------
   Helper: compute how many rank steps user has earned for a package
   based on totalPairs (integer)
   returns stepsCount (0..max)
----------------------- */
function computeRankStepsFromPairs(totalPairs, packageType) {
  const perStep = RANK_CONFIG.pairsPerRankStep || 8;
  const maxSteps = RANK_CONFIG[packageType].incomes.length;
  const steps = Math.floor(totalPairs / perStep); // e.g., 0 -> no rank, 1 -> Star? Design choice: We'll treat steps as number of steps achieved.
  // steps may be 0..n ; but we want steps up to maxSteps
  const capped = Math.min(steps, maxSteps);
  return capped;
}

/* -----------------------
   Helper: extract user's pair count for a given packageType
   We look for matching user.packages entries by packageName or packageType
   Expected user.packages entries: { packageId, packageName, pairsCompleted, sessionsCompleted, ... }
   If not found, returns 0
----------------------- */
function getUserPairsForPackage(user, packageType) {
  if (!user || !Array.isArray(user.packages)) return 0;

  // try match by packageName case-insensitive
  const entry = user.packages.find((p) => {
    if (!p) return false;
    const name = (p.packageName || "").toString().toLowerCase();
    return name.includes(packageType.toLowerCase());
  });

  if (!entry) {
    // fallback: try any package that has pv close to known PV (silver 35, gold 155, ruby 1250)
    const pvMatch = {
      silver: 35,
      gold: 155,
      ruby: 1250,
    }[packageType];
    if (pvMatch) {
      const alt = user.packages.find((p) => Number(p.pv) === pvMatch);
      if (alt) {
        return Number(alt.pairsCompleted || alt.sessionsCompleted || 0);
      }
    }
    return 0;
  }

  return Number(entry.pairsCompleted || entry.sessionsCompleted || 0);
}

/* -----------------------
   Core: recalculate ranks for a single user and apply credits
   Returns an object with what changed
----------------------- */
rankController.recalculateUserRanks = async function (req, res) {
  try {
    const userId = req.params.userId;
    if (!userId) return res.status(400).json({ status: false, message: "userId required" });

    const user = await User.findOne({ userId }).exec();
    if (!user) return res.status(404).json({ status: false, message: "User not found" });

    // prepare
    user.rankHistory = user.rankHistory || []; // ensure array

    const packages = ["silver", "gold", "ruby"];
    const results = {};

    for (const pkg of packages) {
      const pairs = getUserPairsForPackage(user, pkg); // total pairs for this package
      const stepsEarned = computeRankStepsFromPairs(pairs, pkg); // number of rank steps unlocked
      // stepsEarned of 0 means no rank steps; but we consider index 0..stepsEarned-1 inclusive
      const maxSteps = RANK_CONFIG[pkg].incomes.length;

      // For each unlocked rankIndex (0..stepsEarned-1), credit if not already credited
      let newlyCredited = [];
      for (let idx = 0; idx < stepsEarned; idx += 1) {
        // idx corresponds to rankIndex (0=Star, 1=Silver Star,...)
        // But ensure idx < maxSteps
        if (idx >= maxSteps) break;
        const incomeAmount = RANK_CONFIG[pkg].incomes[idx];
        // Check if this rank already present in user.rankHistory
        const exists = user.rankHistory && user.rankHistory.find((r) => r.packageType === pkg && Number(r.rankIndex) === Number(idx));
        if (!exists) {
          // credit this income
          try {
            await creditRankIncomeIfNew(user, pkg, idx, incomeAmount);
            newlyCredited.push({ pkg, rankIndex: idx, rankName: getRankName(pkg, idx), amount: incomeAmount });
          } catch (e) {
            console.error("Failed crediting rank income:", e.message);
            // continue to next rank but record failure
            newlyCredited.push({ pkg, rankIndex: idx, rankName: getRankName(pkg, idx), amount: incomeAmount, error: e.message });
          }
        }
      }

      // Update user's currentRanks mapping (store highest index achieved)
      user.currentRanks = user.currentRanks || {};
      const prev = user.currentRanks[pkg] || -1;
      const newHighest = Math.min(stepsEarned - 1, RANK_CONFIG[pkg].incomes.length - 1);
      user.currentRanks[pkg] = newHighest >= 0 ? newHighest : (prev >= 0 ? prev : -1);

      results[pkg] = {
        pairs,
        stepsEarned,
        newlyCredited,
        currentRankIndex: user.currentRanks[pkg],
        currentRankName: user.currentRanks[pkg] >= 0 ? getRankName(pkg, user.currentRanks[pkg]) : null,
      };
    }

    // Save user with updated rankHistory and currentRanks
    await user.save();

    return res.status(200).json({ status: true, message: "Ranks recalculated", data: results });
  } catch (err) {
    console.error("recalculateUserRanks error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};

/* -----------------------
   Admin: batch recalc for all users
   POST /rank/distribute
   WARNING: heavy operation -- run in background queue for production
----------------------- */
rankController.batchRecalculateAll = async function (req, res) {
  try {
    // Security: only admin can call - ensure middleware or check here
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({ status: false, message: "Admin access required" });
    }

    // In production, this should be queued and processed in chunks.
    const usersCursor = User.find({}).cursor();
    const summary = { totalUsers: 0, updatedUsers: 0, errors: 0 };

    for await (const user of usersCursor) {
      summary.totalUsers += 1;
      try {
        // Recalculate for each user (reuse logic by simulating req/res-less flow)
        // We'll call internal helper to avoid HTTP overhead
        await recalcRanksForUserObj(user);
        summary.updatedUsers += 1;
      } catch (e) {
        console.error("batchRecalculateAll user error:", e.message);
        summary.errors += 1;
      }
    }

    return res.status(200).json({ status: true, message: "Batch recalc started/completed", data: summary });
  } catch (err) {
    console.error("batchRecalculateAll error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};

/* -----------------------
   Helper: internal recalc on a user Mongoose doc (not via HTTP)
   Used by batchRecalculateAll to minimize DB lookups
----------------------- */
async function recalcRanksForUserObj(user) {
  if (!user) throw new Error("Invalid user object");
  user.rankHistory = user.rankHistory || [];
  user.currentRanks = user.currentRanks || {};

  const packages = ["silver", "gold", "ruby"];
  for (const pkg of packages) {
    const pairs = getUserPairsForPackage(user, pkg);
    const stepsEarned = computeRankStepsFromPairs(pairs, pkg);
    const maxSteps = RANK_CONFIG[pkg].incomes.length;

    for (let idx = 0; idx < stepsEarned; idx += 1) {
      if (idx >= maxSteps) break;
      const exists = user.rankHistory.find((r) => r.packageType === pkg && Number(r.rankIndex) === Number(idx));
      if (!exists) {
        // credit
        const incomeAmount = RANK_CONFIG[pkg].incomes[idx];
        await creditRankIncomeIfNew(user, pkg, idx, incomeAmount);
      }
    }

    const newHighest = Math.min(stepsEarned - 1, RANK_CONFIG[pkg].incomes.length - 1);
    user.currentRanks[pkg] = newHighest >= 0 ? newHighest : (user.currentRanks[pkg] || -1);
  }

  await user.save();
}

/* -----------------------
   Get user's rank & rankHistory
   GET /rank/user/:userId
----------------------- */
rankController.getUserRank = async function (req, res) {
  try {
    const userId = req.params.userId;
    if (!userId) return res.status(400).json({ status: false, message: "userId required" });

    // permission: user or admin
    if (!req.user) return res.status(401).json({ status: false, message: "Unauthorized" });
    if (String(req.user.userId) !== String(userId) && !req.user.isAdmin) {
      return res.status(403).json({ status: false, message: "Not authorized" });
    }

    const user = await User.findOne({ userId }).select("userId name rankHistory currentRanks packages").lean();
    if (!user) return res.status(404).json({ status: false, message: "User not found" });

    return res.status(200).json({ status: true, data: user });
  } catch (err) {
    console.error("getUserRank error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};

/* -----------------------
   Admin: rank report summary
   GET /rank/report
----------------------- */
rankController.getRankReport = async function (req, res) {
  try {
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({ status: false, message: "Admin required" });
    }

    // Aggregate counts per highest achieved rank per package
    const report = {};

    for (const pkg of ["silver", "gold", "ruby"]) {
      const pipeline = [
        { $match: { [`currentRanks.${pkg}`]: { $gte: 0 } } },
        {
          $group: {
            _id: "$currentRanks." + pkg,
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ];

      const agg = await User.aggregate(pipeline);
      // map to friendly
      report[pkg] = agg.map((r) => ({
        rankIndex: r._id,
        rankName: r._id >= 0 ? getRankName(pkg, r._id) : null,
        count: r.count,
      }));
    }

    return res.status(200).json({ status: true, data: report });
  } catch (err) {
    console.error("getRankReport error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};

/* -----------------------
   Admin: manually set a user's rank for a package
   POST /rank/set/:userId
   Body: { packageType: 'silver'|'gold'|'ruby', rankIndex: number }
   Use carefully (admin only). This credits income if not previously credited.
----------------------- */
rankController.manualSetRank = async function (req, res) {
  try {
    if (!req.user || !req.user.isAdmin) return res.status(403).json({ status: false, message: "Admin required" });

    const { userId } = req.params;
    const { packageType, rankIndex } = req.body;

    if (!userId || !packageType || rankIndex === undefined || rankIndex === null) {
      return res.status(400).json({ status: false, message: "userId, packageType and rankIndex required" });
    }
    if (!["silver", "gold", "ruby"].includes(packageType)) {
      return res.status(400).json({ status: false, message: "Invalid packageType" });
    }
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ status: false, message: "User not found" });

    user.rankHistory = user.rankHistory || [];
    user.currentRanks = user.currentRanks || {};

    const idx = Number(rankIndex);
    const maxIdx = RANK_CONFIG[packageType].incomes.length - 1;
    if (idx < 0 || idx > maxIdx) {
      return res.status(400).json({ status: false, message: `rankIndex must be 0..${maxIdx}` });
    }

    // If user doesn't have this rank in history, credit it
    const exists = user.rankHistory.find((r) => r.packageType === packageType && Number(r.rankIndex) === idx);
    if (!exists) {
      const amount = RANK_CONFIG[packageType].incomes[idx];
      await creditRankIncomeIfNew(user, packageType, idx, amount);
    }

    // Update highest
    const prev = user.currentRanks[packageType] || -1;
    user.currentRanks[packageType] = Math.max(prev, idx);

    await user.save();

    return res.status(200).json({ status: true, message: "Rank set successfully", data: { userId: user.userId, packageType, rankIndex: idx } });
  } catch (err) {
    console.error("manualSetRank error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};

export default rankController;
