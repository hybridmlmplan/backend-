/**
 * services/rankService.js
 *
 * Rank service for Hybrid MLM Plan (Dev ji)
 * - Computes rank steps from pairs and credits rank incomes (lifetime stacking)
 * - Idempotent: does not credit same rank twice
 * - Exposes utilities for manual set, status, and batch recalculation
 *
 * Integration:
 *   - Provide a credit callback when calling computeAndCreditRanks:
 *       async function credit(userId, amount, type, meta) { ... }
 *     If not provided, this service will try walletService.credit fallback.
 *
 * Notes:
 *   - User model expected fields (adjust if different):
 *       userId (string),
 *       packages: [{ packageId, packageName, pairsCompleted, sessionsCompleted, pv, active }],
 *       rankHistory: [{ packageType, rankIndex, amount, creditedAt }],
 *       currentRanks: { silver: idx, gold: idx, ruby: idx }
 *
 * Author: ChatGPT (master mode) for Dev ji
 * Date: 2025-12-11
 */

import mongoose from "mongoose";
import User from "../models/User.js";
import PVBVLedger from "../models/PVBVLedger.js";
import * as walletService from "../services/walletService.js";

const PAIRS_PER_RANK_STEP = 8; // configurable

// Rank incomes as per plan (index 0 = Star, 1 = Silver Star, ..., 8 = Company Star)
const RANK_INCOMES = {
  silver: [10, 20, 40, 80, 160, 320, 640, 1280, 2560],
  gold: [50, 100, 200, 400, 800, 1600, 3200, 6400, 12800],
  ruby: [500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000],
};

/* -------------------------
   Utility: safe credit (uses provided credit callback, else walletService.credit, else ledger fallback)
   creditCallback(userId, amount, type, meta)
--------------------------*/
async function safeCredit(userId, amount, type = "rank_income", meta = {}, creditCallback = null) {
  if (!userId || !amount || Number(amount) <= 0) return false;

  if (typeof creditCallback === "function") {
    await creditCallback(userId, amount, type, meta);
    return true;
  }

  if (walletService && typeof walletService.credit === "function") {
    await walletService.credit(userId, amount, type, meta);
    return true;
  }

  // Fallback ledger entry
  if (PVBVLedger) {
    await PVBVLedger.create({
      user: mongoose.Types.ObjectId(userId),
      pv: 0,
      bv: 0,
      cash: amount,
      type,
      meta,
      createdAt: new Date(),
    });
    return true;
  }

  throw new Error("No credit mechanism available (provide credit callback or implement walletService.credit)");
}

/* -------------------------
   Helper: get total pairs for packageType from user.packages
   Looks for packageName containing packageType (case-insensitive)
   Returns integer pairs (0 if none)
--------------------------*/
function getPairsFromUserForPackage(user, packageType) {
  if (!user || !Array.isArray(user.packages)) return 0;

  // try exact name match (contains)
  const entry = user.packages.find((p) => {
    if (!p) return false;
    const name = String(p.packageName || "").toLowerCase();
    return name.includes(packageType.toLowerCase());
  });

  if (entry) {
    return Number(entry.pairsCompleted || entry.sessionsCompleted || 0);
  }

  // fallback to PV matching (safe)
  const pvMap = { silver: 35, gold: 155, ruby: 1250 };
  const pvTarget = pvMap[packageType];
  if (pvTarget) {
    const alt = user.packages.find((p) => Number(p.pv) === pvTarget);
    if (alt) return Number(alt.pairsCompleted || alt.sessionsCompleted || 0);
  }

  return 0;
}

/* -------------------------
   computeStepsFromPairs
   returns number of steps (0..max)
   e.g. pairs=0 => 0, pairs=8 => 1, pairs=16 => 2
--------------------------*/
function computeStepsFromPairs(pairs, packageType) {
  const steps = Math.floor(Number(pairs) / PAIRS_PER_RANK_STEP);
  const max = RANK_INCOMES[packageType].length;
  return Math.min(steps, max);
}

/* -------------------------
   core: computeAndCreditRanks
   - userId (string)
   - options: { credit: async callback, saveUser: true (default) }
   returns { userId, results: { silver: {...}, gold: {...}, ruby: {...} } }
--------------------------*/
export async function computeAndCreditRanks(userId, options = {}) {
  if (!userId) throw new Error("userId required");
  const { credit = null, saveUser = true } = options;

  const user = await User.findOne({ userId });
  if (!user) throw new Error("User not found");

  // ensure structures
  user.rankHistory = user.rankHistory || [];
  user.currentRanks = user.currentRanks || {};

  const results = {};

  for (const pkg of ["silver", "gold", "ruby"]) {
    const pairs = getPairsFromUserForPackage(user, pkg);
    const steps = computeStepsFromPairs(pairs, pkg); // number of steps achieved
    const maxSteps = RANK_INCOMES[pkg].length;

    const newlyCredited = [];
    // For stepIndex 0..steps-1, ensure each is credited (if not already)
    for (let idx = 0; idx < steps && idx < maxSteps; idx += 1) {
      const already = user.rankHistory.find(
        (r) => r.packageType === pkg && Number(r.rankIndex) === Number(idx)
      );
      if (already) continue; // idempotent: skip if already credited

      const amount = Number(RANK_INCOMES[pkg][idx]);
      try {
        await safeCredit(user._id || user.userId, amount, "rank_income", { packageType: pkg, rankIndex: idx }, credit);

        // push into rankHistory (credit record)
        user.rankHistory.push({
          packageType: pkg,
          rankIndex: idx,
          rankName: (() => {
            const names = ["Star", "Silver Star", "Gold Star", "Ruby Star", "Emerald Star", "Diamond Star", "Crown Star", "Ambassador Star", "Company Star"];
            return names[idx] || `Rank-${idx}`;
          })(),
          amount,
          creditedAt: new Date(),
        });

        newlyCredited.push({ rankIndex: idx, amount });
      } catch (e) {
        // record failure but continue
        newlyCredited.push({ rankIndex: idx, amount, error: e.message });
        console.error(`Rank credit failed for user ${userId} package ${pkg} idx ${idx}:`, e.message);
      }
    }

    // update currentRanks highest index achieved (store highest index or -1)
    const highest = steps > 0 ? Math.min(steps - 1, maxSteps - 1) : (user.currentRanks[pkg] || -1);
    user.currentRanks[pkg] = highest >= 0 ? highest : (user.currentRanks[pkg] || -1);

    results[pkg] = {
      pairs,
      steps,
      newlyCredited,
      currentRankIndex: user.currentRanks[pkg],
      currentRankName: user.currentRanks[pkg] >= 0 ? (() => {
        const names = ["Star", "Silver Star", "Gold Star", "Ruby Star", "Emerald Star", "Diamond Star", "Crown Star", "Ambassador Star", "Company Star"];
        return names[user.currentRanks[pkg]] || null;
      })() : null,
    };
  }

  if (saveUser) {
    await user.save();
  }

  return { userId, results };
}

/* -------------------------
   getUserRankStatus(userId)
   returns user's pairs and current ranks
--------------------------*/
export async function getUserRankStatus(userId) {
  if (!userId) throw new Error("userId required");
  const user = await User.findOne({ userId }).select("userId packages rankHistory currentRanks").lean();
  if (!user) throw new Error("User not found");

  const status = {};
  for (const pkg of ["silver", "gold", "ruby"]) {
    const pairs = getPairsFromUserForPackage(user, pkg);
    status[pkg] = {
      pairs,
      currentRankIndex: (user.currentRanks && user.currentRanks[pkg]) !== undefined ? user.currentRanks[pkg] : -1,
      currentRankName: (user.currentRanks && user.currentRanks[pkg] >= 0) ? (() => {
        const names = ["Star", "Silver Star", "Gold Star", "Ruby Star", "Emerald Star", "Diamond Star", "Crown Star", "Ambassador Star", "Company Star"];
        return names[user.currentRanks[pkg]] || null;
      })() : null,
      rankHistory: user.rankHistory ? user.rankHistory.filter(r => r.packageType === pkg) : [],
    };
  }
  return status;
}

/* -------------------------
   manualSetRank(userId, packageType, rankIndex, options)
   - Admin function to manually credit a rank if not yet credited
--------------------------*/
export async function manualSetRank(userId, packageType, rankIndex, options = {}) {
  if (!userId || !packageType || rankIndex === undefined || rankIndex === null) {
    throw new Error("userId, packageType and rankIndex required");
  }
  if (!["silver", "gold", "ruby"].includes(packageType)) {
    throw new Error("Invalid packageType");
  }

  const { credit = null, saveUser = true } = options;

  const user = await User.findOne({ userId });
  if (!user) throw new Error("User not found");

  user.rankHistory = user.rankHistory || [];
  user.currentRanks = user.currentRanks || {};

  const exists = user.rankHistory.find((r) => r.packageType === packageType && Number(r.rankIndex) === Number(rankIndex));
  if (exists) {
    // nothing to do
    return { userId, packageType, rankIndex, already: true };
  }

  const maxIdx = RANK_INCOMES[packageType].length - 1;
  if (rankIndex < 0 || rankIndex > maxIdx) {
    throw new Error(`rankIndex must be between 0 and ${maxIdx}`);
  }

  const amount = Number(RANK_INCOMES[packageType][rankIndex]);

  await safeCredit(user._id || user.userId, amount, "rank_income", { manual: true, packageType, rankIndex }, credit);

  user.rankHistory.push({
    packageType,
    rankIndex,
    rankName: (() => {
      const names = ["Star", "Silver Star", "Gold Star", "Ruby Star", "Emerald Star", "Diamond Star", "Crown Star", "Ambassador Star", "Company Star"];
      return names[rankIndex] || `Rank-${rankIndex}`;
    })(),
    amount,
    creditedAt: new Date(),
  });

  // update currentRanks highest
  user.currentRanks[packageType] = Math.max(user.currentRanks[packageType] || -1, rankIndex);

  if (saveUser) await user.save();

  return { userId, packageType, rankIndex, amount, credited: true };
}

/* -------------------------
   recalculateAllUsers(options)
   - Admin batch job: iterate all users and computeAndCreditRanks
   - WARNING: heavy op — run in background with chunking in production
--------------------------*/
export async function recalculateAllUsers(options = {}) {
  const { credit = null, batchSize = 200 } = options;
  const cursor = User.find({}).cursor();
  const summary = { total: 0, success: 0, errors: 0 };

  for await (const user of cursor) {
    summary.total += 1;
    try {
      // Use internal helper that accepts user doc to reduce DB lookups
      // We'll reuse computeAndCreditRanks but avoid re-fetching user inside
      // For simplicity call computeAndCreditRanks(user.userId)
      await computeAndCreditRanks(user.userId, { credit, saveUser: true });
      summary.success += 1;
    } catch (e) {
      console.error("recalculateAllUsers user error:", e.message);
      summary.errors += 1;
    }
  }
  return summary;
}

export default {
  computeAndCreditRanks,
  getUserRankStatus,
  manualSetRank,
  recalculateAllUsers,
};
