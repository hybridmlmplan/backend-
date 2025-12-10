// backend/scripts/binaryEngine.js
// Final Corrected Version — safe for 8-session PV binary

import User from "../models/User.js";
import Binary from "../models/Binary.js";
import SessionModel from "../models/Session.js";
import Wallet from "../models/Wallet.js";
import Transaction from "../models/Transaction.js";
import { distributeLevelIncome } from "../services/levelService.js";

const PACKAGE_CONFIG = {
  silver: { pv: 35, pairIncome: 10, cap: 1 },
  gold: { pv: 155, pairIncome: 50, cap: 1 },
  ruby: { pv: 1250, pairIncome: 500, cap: 1 }
};

// ------------------------------
// MAIN SESSION ENGINE
// ------------------------------
export async function processSessionPairs(sessionNumber, sessionStart = new Date()) {
  try {
    const packages = ["silver", "gold", "ruby"];
    const processedPairs = [];

    for (const pkg of packages) {
      const cfg = PACKAGE_CONFIG[pkg];

      // 1) Find all users having at least 1 red left & 1 red right for this package
      const users = await Binary.aggregate([
        { $match: { packageCode: pkg, isGreen: false } },
        {
          $group: {
            _id: "$userId",
            leftCount: {
              $sum: { $cond: [{ $eq: ["$side", "L"] }, 1, 0] }
            },
            rightCount: {
              $sum: { $cond: [{ $eq: ["$side", "R"] }, 1, 0] }
            }
          }
        },
        { $match: { leftCount: { $gt: 0 }, rightCount: { $gt: 0 } } }
      ]);

      // For each such user, match only 1 pair per session per package
      for (const u of users) {
        // Check existing pair count for this user & package in this session
        const alreadyDone = await SessionModel.countDocuments({
          sessionNumber,
          "processedPairs.userId": u._id.toString(),
          "processedPairs.package": pkg
        });

        if (alreadyDone >= cfg.cap) continue; // cap per session reached

        // Get earliest 1 red left + earliest 1 red right
        const left = await Binary.findOne({
          userId: u._id,
          packageCode: pkg,
          side: "L",
          isGreen: false
        }).sort({ createdAt: 1 });

        const right = await Binary.findOne({
          userId: u._id,
          packageCode: pkg,
          side: "R",
          isGreen: false
        }).sort({ createdAt: 1 });

        if (!left || !right) continue;

        // Mark both as green
        left.isGreen = true;
        left.matchedWith = right._id;
        left.sessionMatched = sessionNumber;
        left.matchedAt = sessionStart;

        right.isGreen = true;
        right.matchedWith = left._id;
        right.sessionMatched = sessionNumber;
        right.matchedAt = sessionStart;

        await left.save();
        await right.save();

        // Credit pair income
        const income = cfg.pairIncome;
        await creditPairIncome(u._id, income, pkg, { left: left._id, right: right._id });

        processedPairs.push({
          userId: u._id.toString(),
          package: pkg,
          amount: income,
          leftId: left._id.toString(),
          rightId: right._id.toString()
        });
      }
    }

    // Save session
    await SessionModel.create({
      sessionNumber,
      processedPairsCount: processedPairs.length,
      processedPairs,
      startedAt: sessionStart,
      createdAt: new Date()
    });

    return { status: true, processed: processedPairs.length };
  } catch (err) {
    console.error("processSessionPairs ERROR:", err);
    return { status: false, error: err.message };
  }
}

// ------------------------------
// WALLET CREDIT HELP
// ------------------------------
async function creditPairIncome(userId, amount, packageCode, meta = {}) {
  await Transaction.create({
    user: userId,
    type: "pair_income",
    packageCode,
    amount,
    meta,
    createdAt: new Date()
  });

  await Wallet.updateOne(
    { user: userId },
    { $inc: { balance: amount } },
    { upsert: true }
  );

  // Level income (0 BV here)
  await distributeLevelIncome(userId, 0);
}

export default { processSessionPairs };
