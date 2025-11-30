/**
 * backend/utils/pairEngine.js
 *
 * GT70 rules respected:
 * - Pair matching based on PV (package pv)
 * - Pair incomes added to user.wallet.pairIncome
 * - Session-based capping (two sessions per day)
 * - Capping enforced via PairHistory model (no change to User model)
 * - Works with existing User fields: leftPV, rightPV, wallet, currentPackage, treeParent
 * - Uses Package collection to get pv/pairIncome/capping
 *
 * Note: Requires models/PairHistory.js (simple model) to persist session counts.
 */

import mongoose from "mongoose";
import User from "../models/User.js";
import Package from "../models/Package.js";
import PairHistory from "../models/PairHistory.js"; // create next (small model)
import IncomeLog from "../models/IncomeLog.js"; // optional: if you store income logs

// Determine current session number (1 or 2) according to GT70
export const getCurrentSessionNumber = () => {
  const hour = new Date().getHours();
  // GT70: Session 1 -> 06:00–16:00 ; Session 2 -> 16:01–23:59
  if (hour >= 6 && hour <= 16) return 1;
  return 2;
};

// Helper: get package rule object from packageName
const getPackageRules = async (packageName) => {
  if (!packageName) return null;
  const pkg = await Package.findOne({ packageName });
  if (!pkg) return null;
  return {
    pairPV: pkg.pv,
    pairIncome: pkg.pairIncome,
    capping: pkg.capping,
    packageName: pkg.packageName,
  };
};

// Helper: get today's date string for PairHistory key (UTC safe)
const getTodayKey = () => {
  const d = new Date();
  // Use YYYY-MM-DD string for day grouping
  return d.toISOString().slice(0, 10);
};

/**
 * Attempt to generate pairs from a starting user and walk up the tree (to root).
 * pvSide indicates which side recently received PV addition ("left" | "right" | null).
 *
 * Behavior:
 * - For each ancestor, check if leftPV and rightPV both >= package pairPV.
 * - For each valid pair, check session capping (via PairHistory for that user+date+session).
 * - If allowed, deduct PV from both sides, credit pair income to wallet, record PairHistory,
 *   optionally create an IncomeLog entry.
 *
 * Important: This function only uses fields already in GT70 User model (leftPV, rightPV, wallet, currentPackage, treeParent).
 * Capping persistence is handled by PairHistory model (separate small collection).
 */
export const generatePairsFromUser = async (startingUserId, pvSide = null) => {
  // We'll use optimistic sequential updates. For production, convert to transaction (Mongo replica set).
  let currentId = startingUserId;
  const todayKey = getTodayKey();
  const session = getCurrentSessionNumber();

  // Walk up to root
  while (currentId) {
    const user = await User.findById(currentId);
    if (!user) break;

    // Skip users without active package
    if (!user.currentPackage || user.currentPackage === "none") {
      currentId = user.treeParent;
      continue;
    }

    const rules = await getPackageRules(user.currentPackage);
    if (!rules) {
      currentId = user.treeParent;
      continue;
    }

    // Try to create as many pairs as possible for this user within capping
    // First, fetch current session count from PairHistory
    let history = await PairHistory.findOne({
      userId: user._id,
      dateKey: todayKey,
      session,
    });

    const usedPairsToday = history ? history.count : 0;
    const remainingCapping = Math.max(0, rules.capping - usedPairsToday);

    // Compute how many pairs possible based on PV available on both sides
    const possiblePairsByPV = Math.floor(
      Math.min(user.leftPV / rules.pairPV, user.rightPV / rules.pairPV)
    );

    const pairsToCreate = Math.min(possiblePairsByPV, remainingCapping);

    if (pairsToCreate <= 0) {
      // nothing to do for this user, move up
      currentId = user.treeParent;
      continue;
    }

    // Create pairs one-by-one to ensure accurate deductions and logs
    for (let i = 0; i < pairsToCreate; i++) {
      // Deduct PV from both sides
      user.leftPV -= rules.pairPV;
      user.rightPV -= rules.pairPV;

      // Credit pair income to wallet
      user.wallet = user.wallet || {};
      user.wallet.pairIncome = (user.wallet.pairIncome || 0) + rules.pairIncome;

      // Optionally track total pair count (we don't modify User model structure here to keep GT70)
      // Instead create/append PairHistory entries
      if (!history) {
        history = await PairHistory.create({
          userId: user._id,
          dateKey: todayKey,
          session,
          count: 1,
        });
      } else {
        history.count += 1;
        await history.save();
      }

      // Optional: Create IncomeLog entry if you use IncomeLog model
      try {
        if (IncomeLog) {
          await IncomeLog.create({
            userId: user._id,
            fromUserId: startingUserId,
            type: "pair",
            amount: rules.pairIncome,
            packageName: rules.packageName,
            date: new Date(),
            session,
          });
        }
      } catch (e) {
        // non-fatal — income logging failure shouldn't break pair creation
        console.error("IncomeLog failed:", e.message);
      }
    }

    // Save user after processing pairs
    await user.save();

    // Move up the tree to give chance for upline to form pairs
    currentId = user.treeParent;
  }

  return { status: true, message: "Pair generation complete" };
};
