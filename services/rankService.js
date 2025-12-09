// services/rankService.js
import mongoose from "mongoose";
import User from "../models/User.js";
import Rank from "../models/Rank.js";
import Wallet from "../models/Wallet.js";
import WalletLedger from "../models/WalletLedger.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Rank rules (as per final plan)
 * - Each rank upgrade requires 8 pairs total:
 *    first 4 pairs -> income (already paid by binary engine)
 *    next 4 pairs  -> cutoff that count toward upgrade
 * - When a user's counters reach 8 for a package, upgrade rank one level,
 *   reset counters for that package (or subtract 8 if you want carryover).
 *
 * - Rank income (pairIncome at rank) is defined in Rank collection (seed).
 * - Royalty & Fund distributions are handled elsewhere (fundService / bvDistributor).
 *
 * Exports:
 * - onPairPaid(userId, packageType)   // called by binary payout flow
 * - computeUserRankIncome(userId, packageType) // optional helper
 * - getRankProgress(userId) // returns counters and next thresholds
 */

// Helper: make unique tx id
function txId(prefix = "RTX") {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`;
}

// Fetch next rank definition for a user/package
async function getNextRankDef(currentLevel, packageType) {
  return await Rank.findOne({ packageType, level: currentLevel + 1 }).lean();
}

// Fetch current rank def
async function getRankDef(level, packageType) {
  return await Rank.findOne({ packageType, level }).lean();
}

// Called when a pair is paid (binaryService should call this AFTER successful payout)
// This will increment income/cutoff counters and upgrade rank if threshold met.
export async function onPairPaid(userId, packageType) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      throw new Error("User not found");
    }

    // counters stored in user.rankCounters
    const counters = user.rankCounters || {};
    const incomeKey = `${packageType}IncomePairs`; // e.g., silverIncomePairs
    const cutoffKey = `${packageType}CutoffPairs`;

    // if income pairs < 4, increment incomePairs, else increment cutoffPairs
    if ((counters[incomeKey] || 0) < 4) {
      counters[incomeKey] = (counters[incomeKey] || 0) + 1;
    } else {
      counters[cutoffKey] = (counters[cutoffKey] || 0) + 1;
    }

    // persist counters
    user.rankCounters = counters;
    await user.save({ session });

    // check for upgrade: if incomePairs + cutoffPairs >= 8 (or cutoffPairs >=4 after income)
    const totalForThisCycle = (counters[incomeKey] || 0) + (counters[cutoffKey] || 0);
    if (totalForThisCycle >= 8) {
      // Upgrade rank (one level)
      const rankField = `${packageType}Rank`; // e.g., silverRank
      const oldLevel = (user.rankStatus && user.rankStatus[rankField]) || 0;
      const newLevel = oldLevel + 1;

      // update rank
      user.rankStatus = user.rankStatus || {};
      user.rankStatus[rankField] = newLevel;

      // reset counters for this package (start new cycle)
      user.rankCounters[incomeKey] = 0;
      user.rankCounters[cutoffKey] = 0;

      // save rank history entry (optional separate model — but here we create a wallet ledger entry for audit)
      // Create a small internal ledger entry marking rank upgrade (category 'rank')
      const wallet = await Wallet.findOneAndUpdate(
        { user: user._id },
        { $set: {} }, // no wallet change, just ensure doc exists
        { upsert: true, new: true, session }
      );

      const upgradeNote = `Rank upgraded: ${packageType} old:${oldLevel} new:${newLevel}`;
      // create a WalletLedger entry with zero amount for audit (balanceAfter same)
      await WalletLedger.create([{
        userId: user._id,
        txId: txId("RUP"),
        type: "credit",
        category: "rank",
        amount: 0,
        balanceAfter: wallet.balance,
        status: "completed",
        ref: null,
        note: upgradeNote
      }], { session });

      await user.save({ session });

      await session.commitTransaction();
      session.endSession();

      return { upgraded: true, packageType, oldLevel, newLevel };
    } else {
      await session.commitTransaction();
      session.endSession();
      return { upgraded: false, packageType, counters };
    }
  } catch (err) {
    try { await session.abortTransaction(); } catch (e) {}
    session.endSession();
    console.error("rankService.onPairPaid error:", err);
    throw err;
  }
}

// Get rank progress for a user (helpful for dashboard)
export async function getRankProgress(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw new Error("User not found");

  const progress = {
    silver: { incomePairs: 0, cutoffPairs: 0, rankLevel: 0 },
    gold: { incomePairs: 0, cutoffPairs: 0, rankLevel: 0 },
    ruby: { incomePairs: 0, cutoffPairs: 0, rankLevel: 0 }
  };

  const counters = user.rankCounters || {};
  const ranks = user.rankStatus || {};

  ["silver","gold","ruby"].forEach(pkg => {
    progress[pkg].incomePairs = counters[`${pkg}IncomePairs`] || 0;
    progress[pkg].cutoffPairs = counters[`${pkg}CutoffPairs`] || 0;
    progress[pkg].rankLevel = ranks[`${pkg}Rank`] || 0;
  });

  return progress;
}
