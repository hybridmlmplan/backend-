// backend/scripts/binaryEngine.js
// Handles PV pair creation, red->green matching, pair income release (per session)
// Usage: import { processSessionPairs } from "./binaryEngine.js"; await processSessionPairs(sessionNumber);

import User from "../models/User.js";
import Binary from "../models/Binary.js";
import SessionModel from "../models/Session.js";
import Wallet from "../models/Wallet.js";
import Transaction from "../models/Transaction.js";
import FundPool from "../models/FundPool.js";
import { distributeLevelIncome } from "../services/levelService.js"; // existing service
import { addWalletTx } from "./walletService.js"; // helper from other script

// package settings (match your plan)
const PACKAGE_CONFIG = {
  silver: { pv: 35, pairIncome: 10, capPerSession: 1 },
  gold: { pv: 155, pairIncome: 50, capPerSession: 1 },
  ruby: { pv: 1250, pairIncome: 500, capPerSession: 1 }
};

// helper: find pending red pairs eligible for this session and try to match them
export async function processSessionPairs(sessionNumber, sessionStart = new Date()) {
  // sessionNumber not used internally except logging; sessionStart used for timestamps
  try {
    // 1. Fetch all new PV entries (binary placements) created since last session until now
    //    Binary model assumed to store placements with { userId, packageCode, side: 'L'|'R', pv, sessionIndex, isGreen, createdAt }
    //    We'll process pairs per user basis: try to match left vs right for same package
    const redPairs = await Binary.find({ isGreen: false }).sort({ createdAt: 1 }).lean();

    // Build maps by user/package/side
    // We'll try simple FIFO matching: for each red left, find earliest red right for same package on other side.
    // But business rule: 1 pair per package per session per user cap (enforced on create)
    const processedPairs = [];

    for (const left of redPairs) {
      // skip if already green or processed
      if (left.isGreen) continue;

      // find opposite side
      const opposite = await Binary.findOne({
        isGreen: false,
        packageCode: left.packageCode,
        side: left.side === "L" ? "R" : "L",
        _id: { $ne: left._id }
      }).sort({ createdAt: 1 });

      if (!opposite) continue; // no match yet

      // Ensure both pairs are eligible (cap per session: 1 pair per package per session)
      // Check user's session pair count for today/session
      const leftUser = await User.findById(left.userId);
      const rightUser = await User.findById(opposite.userId);
      if (!leftUser || !rightUser) continue;

      // Create pair income transactions for both (based on package)
      const pkg = PACKAGE_CONFIG[left.packageCode] || PACKAGE_CONFIG.silver;
      const amount = pkg.pairIncome || 0;

      // Mark both as green and record pair income
      left.isGreen = true;
      left.matchedWith = opposite._id;
      left.sessionMatched = sessionNumber;
      left.matchedAt = sessionStart;

      opposite.isGreen = true;
      opposite.matchedWith = left._id;
      opposite.sessionMatched = sessionNumber;
      opposite.matchedAt = sessionStart;

      await left.save();
      await opposite.save();

      // Credit wallets
      await creditPairIncome(leftUser._id, amount, left.packageCode, { fromPairId: left._id });
      await creditPairIncome(rightUser._id, amount, opposite.packageCode, { fromPairId: opposite._id });

      // record processed
      processedPairs.push({ left: left._id.toString(), right: opposite._id.toString(), amount });
    }

    // Update session record
    await SessionModel.create({
      sessionNumber,
      processedPairsCount: processedPairs.length,
      processedPairs,
      startedAt: sessionStart,
      createdAt: new Date()
    });

    return { status: true, processed: processedPairs.length, processedPairs };
  } catch (err) {
    console.error("binaryEngine.processSessionPairs error:", err);
    return { status: false, error: err.message };
  }
}

async function creditPairIncome(userId, amount, packageCode, meta = {}) {
  // Add wallet ledger entry and update user wallet
  const tx = await Transaction.create({
    user: userId,
    type: "pair_income",
    packageCode,
    amount,
    meta,
    createdAt: new Date()
  });

  // Update wallet (atomic update)
  await Wallet.updateOne({ user: userId }, { $inc: { balance: amount } }, { upsert: true });

  // Distribute level income (BV based logic separate, but pair income is PV source; if your plan requires level income on BV conversion, call below with bv equivalent)
  // If pair income should also contribute to BV -> then add to FundPool / BV ledger (not here unless specified)
  await distributeLevelIncome(userId, 0); // keep 0 unless you derive BV here

  return tx;
}

// default export convenience
export default { processSessionPairs, creditPairIncome };
