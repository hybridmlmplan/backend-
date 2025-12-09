// services/epinService.js
import crypto from "crypto";
import mongoose from "mongoose";
import EPIN from "../models/EPIN.js";
import User from "../models/User.js";
import PackageModel from "../models/Package.js";
import PVLedger from "../models/PVLedger.js";

/**
 * EPIN rules per plan:
 * - Unlimited EPIN generation (admin)
 * - No expiry
 * - Unlimited transfer between users (no admin approval)
 * - Redeem EPIN to activate package:
 *    -> assign package to user (package field)
 *    -> credit PV to user (package.pv)
 *    -> create PVLedger entry
 *
 * All critical changes done inside mongoose transaction where required.
 */

// Helper: generate single code (12 chars alphanumeric)
function genCode(len = 12) {
  return crypto.randomBytes(Math.ceil(len/2)).toString("hex").slice(0, len).toUpperCase();
}

// Generate N EPINs for a package. createdBy optional admin userId.
export async function generateEPINs({ packageCode, count = 1, createdBy = null, note = "" }) {
  if (!["silver","gold","ruby"].includes(packageCode)) throw new Error("Invalid packageCode");
  count = Number(count) || 1;
  if (count <= 0) throw new Error("count must be > 0");

  const epins = [];
  for (let i=0;i<count;i++){
    const code = genCode(12);
    epins.push({
      code,
      packageCode,
      createdBy,
      note
    });
  }
  // Bulk insert
  const docs = await EPIN.insertMany(epins);
  return docs;
}

// Assign an existing EPIN to a user (transfer, or admin assign)
// No admin approval required for transfers; this function used by both
export async function assignEPINToUser({ code, toUserId, byUserId = null }) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const epin = await EPIN.findOne({ code }).session(session);
    if (!epin) throw new Error("EPIN not found");
    if (epin.isUsed) throw new Error("EPIN already used");

    // Update assignedTo
    epin.assignedTo = toUserId;
    // optional note about who transferred
    if (byUserId) epin.note = `Transferred by ${byUserId}`;
    await epin.save({ session });

    await session.commitTransaction();
    session.endSession();
    return epin;
  } catch (err) {
    try { await session.abortTransaction(); } catch(e){}
    session.endSession();
    throw err;
  }
}

// Redeem EPIN: activate package for user & credit PV
export async function redeemEPIN({ code, userId }) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const epin = await EPIN.findOne({ code }).session(session);
    if (!epin) throw new Error("EPIN not found");
    if (epin.isUsed) throw new Error("EPIN already redeemed");

    // package info
    const pkg = await PackageModel.findOne({ code: epin.packageCode }).session(session);
    if (!pkg) throw new Error("Package config not found");

    // user
    const user = await User.findById(userId).session(session);
    if (!user) throw new Error("User not found");

    // Activate user's package: set package, set activatedAt (if non_active -> activate)
    user.package = epin.packageCode;
    user.packageActivatedAt = new Date();

    // Credit PV to user.pvBalance for that package
    user.pvBalance = user.pvBalance || { silver:0, gold:0, ruby:0 };
    user.pvBalance[epin.packageCode] = (user.pvBalance[epin.packageCode] || 0) + pkg.pv;

    // Save user
    await user.save({ session });

    // Mark EPIN used
    epin.isUsed = true;
    epin.usedBy = user._id;
    epin.usedAt = new Date();
    await epin.save({ session });

    // Create PVLedger entry
    await PVLedger.create([{
      userId: user._id,
      type: "credit",
      packageType: epin.packageCode,
      amount: pkg.pv,
      balanceAfter: user.pvBalance[epin.packageCode],
      source: "epin",
      refId: epin._id
    }], { session });

    await session.commitTransaction();
    session.endSession();

    return { user, epin };
  } catch (err) {
    try { await session.abortTransaction(); } catch(e){}
    session.endSession();
    throw err;
  }
}

// Get EPINs by filter (admin)
export async function listEPINs({ filter = {}, limit = 100, skip = 0 }) {
  const q = { ...filter };
  const docs = await EPIN.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
  return docs;
}

// Get EPINs for a user (owned)
export async function listEPINsForUser(userId) {
  const docs = await EPIN.find({ assignedTo: userId, isUsed: false }).sort({ createdAt: -1 }).lean();
  return docs;
}
