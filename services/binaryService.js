// backend/services/binaryService.js
import Binary from "../models/Binary.js";
import User from "../models/User.js";
import SessionModel from "../models/Session.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import { addWalletTx } from "./walletService.js"; // आपके project में यही फ़ंक्शन होना चाहिए
import { Types } from "mongoose";

/**
 * Binary service
 * - placePV: जब user package active करता है (EPIN डालकर), तब call होगा
 * - getUserRedCounts: user की red side counts दिखाने के लिए (debug/admin)
 * - findEarliestRed: earliest red entry fetch करनe के लिए
 * - matchOnePairForUserPackage: session में user/package के लिए single pair match (red->green) करने के लिए
 * - package config: plan के हिसाब से
 */

/* ======= PLAN PACKAGE CONFIG (Final plan) ======= */
export const PACKAGE_CONFIG = {
  silver: { code: "silver", pv: 35, pairIncome: 10, capPerSession: 1 },
  gold: { code: "gold", pv: 155, pairIncome: 50, capPerSession: 1 },
  ruby: { code: "ruby", pv: 1250, pairIncome: 500, capPerSession: 1 }
};

/* ======= Utility ======= */
function normalizePkg(code) {
  if (!code) return "silver";
  return String(code).toLowerCase();
}

/* ======= 1) Place PV / create Binary entry (RED by default) =======
   Called when user activates package via EPIN / admin grants PV placement.
   side: "L" or "R"
   meta: optional { source: 'epin'|'admin', note: '' }
*/
export async function placePV(userId, packageCode = "silver", side = "L", meta = {}) {
  packageCode = normalizePkg(packageCode);
  if (!["L", "R"].includes(side)) throw new Error("side must be 'L' or 'R'");

  const cfg = PACKAGE_CONFIG[packageCode] || PACKAGE_CONFIG.silver;

  const bin = await Binary.create({
    userId: Types.ObjectId(userId),
    packageCode,
    pv: cfg.pv,
    side,
    isGreen: false, // new entries always RED
    createdAt: new Date(),
    meta
  });

  return bin;
}

/* ======= 2) Get count of red/green per user/package (admin/debug) ======= */
export async function getUserRedCounts(userId, packageCode = null) {
  const match = { userId: Types.ObjectId(userId) };
  if (packageCode) match.packageCode = normalizePkg(packageCode);

  const agg = await Binary.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$packageCode",
        total: { $sum: 1 },
        red: { $sum: { $cond: [{ $eq: ["$isGreen", false] }, 1, 0] } },
        green: { $sum: { $cond: [{ $eq: ["$isGreen", true] }, 1, 0] } }
      }
    }
  ]);

  return agg;
}

/* ======= 3) Find earliest red entry for a user/package/side ======= */
export async function findEarliestRed(userId, packageCode, side) {
  packageCode = normalizePkg(packageCode);
  const doc = await Binary.findOne({
    userId: Types.ObjectId(userId),
    packageCode,
    side,
    isGreen: false
  }).sort({ createdAt: 1 });

  return doc;
}

/* ======= 4) Internal helper: mark two Binary docs as green and credit pair income ======= */
async function settlePairAndCredit(leftDoc, rightDoc, sessionNumber, sessionStart = new Date()) {
  // mark green
  leftDoc.isGreen = true;
  leftDoc.matchedWith = rightDoc._id;
  leftDoc.sessionMatched = sessionNumber;
  leftDoc.matchedAt = sessionStart;

  rightDoc.isGreen = true;
  rightDoc.matchedWith = leftDoc._id;
  rightDoc.sessionMatched = sessionNumber;
  rightDoc.matchedAt = sessionStart;

  await leftDoc.save();
  await rightDoc.save();

  // determine package (should be same)
  const pkg = leftDoc.packageCode || rightDoc.packageCode || "silver";
  const income = (PACKAGE_CONFIG[pkg] && PACKAGE_CONFIG[pkg].pairIncome) || 0;

  // create transaction records and credit wallet for both users
  // left user
  await Transaction.create({
    user: leftDoc.userId,
    type: "pair_income",
    packageCode: pkg,
    amount: income,
    meta: { fromLeft: leftDoc._id, matchedWith: rightDoc._id, sessionNumber },
    createdAt: new Date()
  });
  await addWalletTx(leftDoc.userId, income, "pair_income", { packageCode: pkg, pairId: leftDoc._id });

  // right user
  await Transaction.create({
    user: rightDoc.userId,
    type: "pair_income",
    packageCode: pkg,
    amount: income,
    meta: { fromRight: rightDoc._id, matchedWith: leftDoc._id, sessionNumber },
    createdAt: new Date()
  });
  await addWalletTx(rightDoc.userId, income, "pair_income", { packageCode: pkg, pairId: rightDoc._id });

  return { amount: income, package: pkg };
}

/* ======= 5) Check session cap (per user, per package) =======
   Returns boolean: whether user already has cap reached in this session
   sessionNumber must be provided by scheduler/engine.
*/
export async function isSessionCapReached(userId, packageCode, sessionNumber) {
  if (!sessionNumber && sessionNumber !== 0) return false; // fail-safe (no enforcement)
  packageCode = normalizePkg(packageCode);
  const cfg = PACKAGE_CONFIG[packageCode] || PACKAGE_CONFIG.silver;

  // count processed pairs by this user/package in this session
  const cnt = await SessionModel.countDocuments({
    sessionNumber,
    "processedPairs.userId": String(userId),
    "processedPairs.package": packageCode
  });

  return cnt >= (cfg.capPerSession || 1);
}

/* ======= 6) Try to match single pair for a given user & package in this session =======
   - will fetch earliest left & earliest right (isGreen:false) for the same user and package
   - check session cap (uses SessionModel entries)
   - if matched => mark green + credit (via settlePairAndCredit) and also push into SessionModel processedPairs
*/
export async function matchOnePairForUserPackage(userId, packageCode, sessionNumber, sessionStart = new Date()) {
  packageCode = normalizePkg(packageCode);
  const cfg = PACKAGE_CONFIG[packageCode] || PACKAGE_CONFIG.silver;

  // enforce cap via session record
  const capReached = await isSessionCapReached(userId, packageCode, sessionNumber);
  if (capReached) return { status: false, reason: "cap_reached" };

  // find earliest left & right
  const left = await Binary.findOne({
    userId: Types.ObjectId(userId),
    packageCode,
    side: "L",
    isGreen: false
  }).sort({ createdAt: 1 });

  const right = await Binary.findOne({
    userId: Types.ObjectId(userId),
    packageCode,
    side: "R",
    isGreen: false
  }).sort({ createdAt: 1 });

  if (!left || !right) return { status: false, reason: "no_match_available" };

  // settle
  const result = await settlePairAndCredit(left, right, sessionNumber, sessionStart);

  // append to SessionModel (single document per sessionNumber — create or update)
  await SessionModel.updateOne(
    { sessionNumber },
    {
      $push: {
        processedPairs: {
          userId: String(userId),
          package: packageCode,
          amount: result.amount,
          leftId: String(left._id),
          rightId: String(right._id),
          timestamp: new Date()
        }
      },
      $inc: { processedPairsCount: 1 }
    },
    { upsert: true }
  );

  return { status: true, processed: 1, package: packageCode, amount: result.amount };
}

/* ======= 7) Find users who have at least one red-left & red-right for a package
   Returns array of userIds — useful for session processors to iterate.
   We limit results to avoid huge scans.
*/
export async function findUsersWithRedPairs(packageCode, limit = 500) {
  packageCode = normalizePkg(packageCode);
  const agg = await Binary.aggregate([
    { $match: { packageCode, isGreen: false } },
    {
      $group: {
        _id: "$userId",
        leftCount: { $sum: { $cond: [{ $eq: ["$side", "L"] }, 1, 0] } },
        rightCount: { $sum: { $cond: [{ $eq: ["$side", "R"] }, 1, 0] } }
      }
    },
    { $match: { leftCount: { $gt: 0 }, rightCount: { $gt: 0 } } },
    { $limit: limit }
  ]);

  return agg.map(x => x._id);
}

/* ======= 8) Admin helper: forceResetRedCycleForUserPackage
   - When package completes (your plan: after 8 sessions done) admin may want to reset cycle
   - This will mark remaining RED entries as new cycle (optionally archive) — here we only provide a simple utility:
*/
export async function resetRedCycleForUserPackage(userId, packageCode) {
  packageCode = normalizePkg(packageCode);
  // Implementation choice: do nothing destructive. Optionally add cycleId etc.
  // For now we will mark all leftover RED for that user's package with meta.note = 'cycle_reset' & updatedAt
  const res = await Binary.updateMany(
    { userId: Types.ObjectId(userId), packageCode, isGreen: false },
    { $set: { "meta.cycleResetAt": new Date() } }
  );
  return res;
}

/* ======= Exports ======= */
export default {
  PACKAGE_CONFIG,
  placePV,
  getUserRedCounts,
  findEarliestRed,
  isSessionCapReached,
  matchOnePairForUserPackage,
  findUsersWithRedPairs,
  resetRedCycleForUserPackage
};
