// backend/scripts/binaryEngine.js
// Binary engine — final production version for your FINAL plan (8 sessions/day)
// Usage:
//   await processSessionPairs(sessionNumber, new Date());

import mongoose from "mongoose";
import User from "../models/User.js";
import Binary from "../models/Binary.js";
import SessionModel from "../models/Session.js";
import Wallet from "../models/Wallet.js";
import Transaction from "../models/Transaction.js";
import { distributeLevelIncome } from "../services/levelService.js"; // note: expects BV param (0 here)

const PACKAGE_ORDER = ["silver", "gold", "ruby"];
const PACKAGE_CONFIG = {
  silver: { pv: 35, pairIncome: 10, capPerSession: 1 },
  gold: { pv: 155, pairIncome: 50, capPerSession: 1 },
  ruby: { pv: 1250, pairIncome: 500, capPerSession: 1 }
};

const SAFE_MIN = 0.000001;

/**
 * Main entry:
 * Processes one session run. sessionNumber is an integer (1..8 or any index you use).
 * sessionStart is a Date for matchedAt timestamps.
 */
export async function processSessionPairs(sessionNumber, sessionStart = new Date()) {
  if (!sessionNumber) throw new Error("processSessionPairs: sessionNumber required");

  const sessionProcessed = [];
  const session = await mongoose.startSession();
  try {
    // We'll not keep transaction open for entire multi-user loop.
    // Instead we will use per-user smaller transactions to avoid long locks.
    for (const pkg of PACKAGE_ORDER) {
      const cfg = PACKAGE_CONFIG[pkg];

      // 1) Find candidate users who have at least one RED left and one RED right entry for this package.
      //    Group by userId (these Binary docs are considered contributions under that user's legs)
      const candidates = await Binary.aggregate([
        { $match: { packageCode: pkg, isGreen: false } },
        {
          $group: {
            _id: "$userId",
            leftCount: { $sum: { $cond: [{ $eq: ["$side", "L"] }, 1, 0] } },
            rightCount: { $sum: { $cond: [{ $eq: ["$side", "R"] }, 1, 0] } }
          }
        },
        { $match: { leftCount: { $gt: 0 }, rightCount: { $gt: 0 } } }
      ]);

      // Process candidates FIFO order by earliest red placement time — we will fetch earliest left/right per user
      for (const cand of candidates) {
        const userId = cand._id;

        // Check user's package is active (only active package holders eligible to receive pair income)
        const user = await User.findById(userId).lean();
        if (!user) continue;
        if (!user.packageCode || user.packageCode !== pkg) {
          // if user doesn't have this package active, skip (pair income only for users holding the package)
          continue;
        }
        if (!user.isActivePackage) continue;

        // Check whether this user already got pair for this package in this session (cap)
        // We query SessionModel existing runs for this sessionNumber
        const alreadyPaid = await SessionModel.countDocuments({
          sessionNumber,
          "processedPairs.userId": userId,
          "processedPairs.package": pkg
        });

        if (alreadyPaid >= cfg.capPerSession) continue; // cap reached

        // Start a short transaction to reserve and pay this pair atomically
        await session.withTransaction(async () => {
          // Re-check that left/right still exist (not claimed concurrently)
          const left = await Binary.findOneAndUpdate(
            { userId, packageCode: pkg, side: "L", isGreen: false },
            { $set: { locking: true } }, // optimistic small lock marker
            { sort: { createdAt: 1 }, session }
          );

          const right = await Binary.findOneAndUpdate(
            { userId, packageCode: pkg, side: "R", isGreen: false, locking: { $ne: true } },
            { $set: { locking: true } },
            { sort: { createdAt: 1 }, session }
          );

          // If either not found, undo locks and skip
          if (!left || !right) {
            // unlock if needed
            if (left) await Binary.updateOne({ _id: left._id }, { $unset: { locking: "" } }, { session });
            if (right) await Binary.updateOne({ _id: right._id }, { $unset: { locking: "" } }, { session });
            return;
          }

          // Mark both as green and set matched metadata (atomic update)
          const matchedAt = sessionStart;
          await Binary.updateOne(
            { _id: left._id },
            {
              $set: {
                isGreen: true,
                matchedWith: right._id,
                sessionMatched: sessionNumber,
                matchedAt,
                locking: false
              }
            },
            { session }
          );

          await Binary.updateOne(
            { _id: right._id },
            {
              $set: {
                isGreen: true,
                matchedWith: left._id,
                sessionMatched: sessionNumber,
                matchedAt,
                locking: false
              }
            },
            { session }
          );

          // Create transaction entry and credit wallet (atomic)
          const amount = cfg.pairIncome || 0;

          const tx = await Transaction.create(
            [
              {
                user: userId,
                type: "pair_income",
                packageCode: pkg,
                amount,
                meta: { leftId: left._id, rightId: right._id, sessionNumber },
                createdAt: new Date()
              }
            ],
            { session }
          );

          await Wallet.updateOne(
            { user: userId },
            { $inc: { balance: amount } },
            { upsert: true, session }
          );

          // Level income distribution is BV-based — pair income is PV-based (per plan).
          // We call distributeLevelIncome with 0 BV here (or appropriate BV if conversion rules apply).
          // Keep contract: distributeLevelIncome(userId, bvAmount)
          await distributeLevelIncome(userId, 0);

          // Append to in-memory processed list (will be saved to SessionModel later)
          sessionProcessed.push({
            userId: userId.toString(),
            package: pkg,
            amount,
            leftId: left._id.toString(),
            rightId: right._id.toString()
          });
        }); // end transaction
      } // end candidates loop
    } // end packages loop

    // After processing all packages, create SessionModel record (single write)
    if (sessionProcessed.length > 0) {
      await SessionModel.create({
        sessionNumber,
        processedPairsCount: sessionProcessed.length,
        processedPairs: sessionProcessed,
        startedAt: sessionStart,
        createdAt: new Date()
      });
    } else {
      // still log an empty session record for traceability
      await SessionModel.create({
        sessionNumber,
        processedPairsCount: 0,
        processedPairs: [],
        startedAt: sessionStart,
        createdAt: new Date()
      });
    }

    return { status: true, processed: sessionProcessed.length, processedPairs: sessionProcessed };
  } catch (err) {
    console.error("binaryEngine.processSessionPairs ERROR:", err);
    return { status: false, error: err.message };
  } finally {
    session.endSession();
  }
}

// Export helper for single user credit (if needed elsewhere)
export async function creditPairIncome(userId, amount, packageCode, meta = {}) {
  if (!userId) throw new Error("creditPairIncome: missing userId");
  if (!amount || typeof amount !== "number" || amount <= SAFE_MIN) return null;

  // Use a short transaction to create transaction + wallet update atomically
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const tx = await Transaction.create(
      [
        {
          user: userId,
          type: "pair_income",
          packageCode,
          amount,
          meta,
          createdAt: new Date()
        }
      ],
      { session }
    );

    await Wallet.updateOne({ user: userId }, { $inc: { balance: amount } }, { upsert: true, session });

    // level income call
    await distributeLevelIncome(userId, 0);

    await session.commitTransaction();
    session.endSession();

    return tx[0];
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("creditPairIncome error:", err);
    throw err;
  }
}

export default { processSessionPairs, creditPairIncome };
                                      
