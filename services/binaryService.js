// services/binaryService.js
import mongoose from "mongoose";
import Binary from "../models/Binary.js";
import User from "../models/User.js";
import PackageModel from "../models/Package.js";
import WalletLedger from "../models/WalletLedger.js";
import PVLedger from "../models/PVLedger.js";
import Wallet from "../models/Wallet.js";
import SessionModel from "../models/Session.js";
import { v4 as uuidv4 } from "uuid";
import Rank from "../models/Rank.js";
import { getCurrentSessionIndex } from "../utils/sessionHelper.js"; // helper to compute sessionNumber from time

/**
 * Core responsibilities:
 * - createPairIfEligible(userId, packageType, sessionNumber)
 * - processSession(sessionNumber, sessionDate)  // convert RED->GREEN where eligible and payout
 * - payoutPair(pair, session) -> credits wallets and ledger
 * - resetCycleIfNeeded(userId, packageType) -> increments cycle and resets counters
 *
 * Note: Ensure DB transactions while crediting wallet + writing pair status
 */

function makeTxId(prefix = "WTX") {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`;
}

// create a new RED pair between left and right users for a package & session
export async function createPairManual({
  leftUserId,
  rightUserId,
  packageType,
  sessionNumber,
  sessionDate = new Date()
}) {
  // PairId unique
  const pairId = "P" + uuidv4().split("-")[0];
  const p = await Binary.create({
    pairId,
    packageType,
    sessionNumber,
    sessionDate,
    leftUserId,
    rightUserId,
    status: "red",
    cycleNumber: 1
  });
  return p;
}

// Called when PV is credited and a placement match is found — to create pending pair
export async function createPairIfEligible(userId, packageType, sessionNumber, sessionDate = new Date()) {
  // Simple approach:
  // For a user we try to find their placement partner (opposite side) active in tree.
  // Complex tree traversal not implemented here — assume external placement created proper left/right user links.
  // We'll create a pair with sponsor/placement pair if both have PV >= package PV.
  const pkg = await PackageModel.findOne({ code: packageType });
  if (!pkg) throw new Error("Package config not found: " + packageType);

  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  // Quick check PV balance
  const userPV = (user.pvBalance && user.pvBalance[packageType]) || 0;
  if (userPV < pkg.pv) {
    // insufficient PV
    return null;
  }

  // Find a potential partner in same placement parent (simple heuristic)
  // Try placement sibling on same placementId but opposite side
  const parentId = user.placementId;
  if (!parentId) return null;

  // find opposite-side user under same parent and with PV >= pkg.pv
  const oppositeSide = user.placementSide === "left" ? "right" : "left";
  const partner = await User.findOne({
    placementId: parentId,
    placementSide: oppositeSide,
    [`pvBalance.${packageType}`]: { $gte: pkg.pv }
  });

  if (!partner) {
    // no partner now -> create a red pair with placeholder right/left as pending (we still store pair referencing user itself)
    // We'll create no pair until actual partner found to avoid wrong counts.
    return null;
  }

  // Both have PV, create red pair record
  return await createPairManual({
    leftUserId: user.placementSide === "left" ? user._id : partner._id,
    rightUserId: user.placementSide === "left" ? partner._id : user._id,
    packageType,
    sessionNumber,
    sessionDate
  });
}

// Core: process pending pairs for a session (convert reds to greens and payout)
export async function processSessionPairs(sessionNumber, sessionDate = new Date()) {
  // sessionDate should be normalized to yyyy-mm-dd at start of day to match Binary.sessionDate usage
  const dateKey = new Date(sessionDate);
  dateKey.setHours(0, 0, 0, 0);

  // Find RED pairs in this session
  const reds = await Binary.find({
    sessionNumber,
    sessionDate: { $gte: dateKey },
    status: "red",
  }).limit(1000); // batch limit for safety

  for (const pair of reds) {
    await tryConvertPairToGreen(pair);
  }

  return { processed: reds.length };
}

// Try converting a single pair to green and pay both users if eligible
export async function tryConvertPairToGreen(pair) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // reload pair inside transaction
    const p = await Binary.findById(pair._id).session(session);
    if (!p) {
      await session.abortTransaction();
      session.endSession();
      return null;
    }

    if (p.status === "green") {
      await session.commitTransaction();
      session.endSession();
      return p;
    }

    // fetch users
    const left = await User.findById(p.leftUserId).session(session);
    const right = await User.findById(p.rightUserId).session(session);
    if (!left || !right) {
      await session.abortTransaction();
      session.endSession();
      return null;
    }

    // Check package active & PV availability (both must have PV >= package PV)
    const pkg = await PackageModel.findOne({ code: p.packageType }).session(session);
    if (!pkg) {
      await session.abortTransaction();
      session.endSession();
      throw new Error("Package config missing");
    }

    const leftPV = (left.pvBalance && left.pvBalance[p.packageType]) || 0;
    const rightPV = (right.pvBalance && right.pvBalance[p.packageType]) || 0;
    if (leftPV < pkg.pv || rightPV < pkg.pv) {
      // not eligible yet: keep red
      await session.abortTransaction();
      session.endSession();
      return null;
    }

    // All good -> convert to green, payout to both sides according to rank/pair income.
    p.status = "green";
    p.greenAt = new Date();
    p.paid = true;

    // Determine payout amount: base pairIncome from package plus rank multiplier if any
    let basePayout = pkg.pairIncome; // e.g., 10/50/500

    // Optionally, check rank levels and override payout if user has higher rank (we keep base for now)
    p.payoutAmount = basePayout;

    // Create wallet ledger & update wallet for both users
    // Left
    const leftWallet = await Wallet.findOneAndUpdate(
      { user: left._id },
      { $inc: { balance: basePayout } },
      { upsert: true, new: true, session }
    );
    const leftTxId = makeTxId("WTX");
    await WalletLedger.create([{
      userId: left._id,
      txId: leftTxId,
      type: "credit",
      category: "binary",
      amount: basePayout,
      balanceAfter: leftWallet.balance,
      status: "completed",
      ref: p._id,
      note: `Pair payout package ${p.packageType}`
    }], { session });

    // Right
    const rightWallet = await Wallet.findOneAndUpdate(
      { user: right._id },
      { $inc: { balance: basePayout } },
      { upsert: true, new: true, session }
    );
    const rightTxId = makeTxId("WTX");
    await WalletLedger.create([{
      userId: right._id,
      txId: rightTxId,
      type: "credit",
      category: "binary",
      amount: basePayout,
      balanceAfter: rightWallet.balance,
      status: "completed",
      ref: p._id,
      note: `Pair payout package ${p.packageType}`
    }], { session });

    // Persist pair changes
    await p.save({ session });

    // After payout, create new RED pair to enable next cycle (cycleNumber++)
    const newPair = await Binary.create([{
      pairId: "P" + uuidv4().split("-")[0],
      packageType: p.packageType,
      sessionNumber: p.sessionNumber,
      sessionDate: p.sessionDate,
      leftUserId: p.leftUserId,
      rightUserId: p.rightUserId,
      status: "red",
      cycleNumber: p.cycleNumber + 1,
    }], { session });

    await session.commitTransaction();
    session.endSession();

    return p;
  } catch (err) {
    try { await session.abortTransaction(); } catch (e) {}
    session.endSession();
    console.error("tryConvertPairToGreen error", err);
    throw err;
  }
}

// Utility: get pending red pairs for a user
export async function getPendingPairsForUser(userId) {
  const reds = await Binary.find({
    status: "red",
    $or: [{ leftUserId: userId }, { rightUserId: userId }]
  }).sort({ createdAt: -1 }).limit(200);
  return reds;
}
