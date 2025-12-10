// backend/scripts/epinService.js
// EPIN service — generate, activate, transfer (unlimited), audit
// Follows FINAL plan: unlimited EPIN, no expiry, token ON/OFF
// Usage examples:
//   await generateEPINs({ qty: 100, packageCode: 'silver', createdBy });
//   await activateEPIN({ userId, code });
//   await transferEPIN({ fromUserId, toUserId, code });

import mongoose from "mongoose";
import crypto from "crypto";
import EPIN from "../models/EPIN.js";
import User from "../models/User.js";

const EPIN_TOKEN_ON = (process.env.EPIN_TOKEN_ON === "true"); // "true" or "false"
const CODE_LEN = 10; // length of generated EPIN code (alphanumeric)
const SAFE_MIN = 1;

/** helper: create unique code */
function makeCode(len = CODE_LEN) {
  // uppercase alphanumeric
  return crypto.randomBytes(Math.ceil(len * 0.6)).toString("base64").replace(/[^A-Z0-9]/gi, "").slice(0, len).toUpperCase();
}

/**
 * Generate N EPINs (admin only). Returns array of created EPIN docs.
 * @param {Object} opts { qty: Number, packageCode: String, createdBy: userId, meta: Object (optional), tokenRequired: Boolean (optional) }
 */
export async function generateEPINs({ qty = 1, packageCode = "silver", createdBy = null, meta = {}, tokenRequired = EPIN_TOKEN_ON } = {}) {
  if (!qty || typeof qty !== "number" || qty < SAFE_MIN) throw new Error("generateEPINs: invalid qty");
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const created = [];
    for (let i = 0; i < qty; i++) {
      // ensure uniqueness — retry loop
      let code;
      let tries = 0;
      do {
        code = makeCode(CODE_LEN);
        tries++;
        if (tries > 6) code = `${code}-${Date.now().toString().slice(-5)}`;
      } while (await EPIN.exists({ code }));

      const doc = {
        code,
        packageCode,
        createdBy,
        owner: null,
        isUsed: false,
        usedBy: null,
        usedAt: null,
        meta: { ...(meta || {}), tokenRequired: !!tokenRequired },
        createdAt: new Date(),
        lastTransferredAt: null,
        transferCount: 0
      };

      const createdDoc = await EPIN.create([doc], { session });
      created.push(createdDoc[0]);
    }

    await session.commitTransaction();
    session.endSession();
    return created;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("generateEPINs error:", err);
    throw err;
  }
}

/**
 * Activate EPIN for a user — marks EPIN used, assigns package to user (non-active -> active handled)
 * Returns { success:true, epin, user } on success
 * Rules: EPIN must exist, not used. If EPIN.meta.tokenRequired === true, and EPIN.meta.token provided, validate inside (you can extend).
 */
export async function activateEPIN({ userId, code, token = null } = {}) {
  if (!userId) throw new Error("activateEPIN: missing userId");
  if (!code) throw new Error("activateEPIN: missing code");

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // find EPIN and lock it (atomic)
    const epin = await EPIN.findOne({ code }).session(session);
    if (!epin) throw new Error("EPIN not found");
    if (epin.isUsed) throw new Error("EPIN already used");

    // token enforcement if required
    const tokenRequired = !!(epin.meta && epin.meta.tokenRequired);
    if (tokenRequired && EPIN_TOKEN_ON) {
      // if EPIN has token stored in meta.token, require match
      if (epin.meta && epin.meta.token) {
        if (!token || token !== epin.meta.token) throw new Error("EPIN token mismatch");
      } else {
        // no token in EPIN — depends on policy; allow activation only if token provided and matches some external check.
        // For now, if EPIN_TOKEN_ON and no token stored, reject to force admin to create token-aware epins.
        throw new Error("EPIN token required but not present");
      }
    }

    // assign EPIN to user and mark used
    epin.owner = userId;
    epin.isUsed = true;
    epin.usedBy = userId;
    epin.usedAt = new Date();
    await epin.save({ session });

    // update user package status (activate package)
    const user = await User.findById(userId).session(session);
    if (!user) throw new Error("User not found");

    user.packageCode = epin.packageCode;
    user.isActivePackage = true;
    // If you need to set PV counters or other fields, add here.
    await user.save({ session });

    await session.commitTransaction();
    session.endSession();

    return { success: true, epin, user };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("activateEPIN error:", err);
    throw err;
  }
}

/**
 * Transfer EPIN: unlimited transfers allowed.
 * fromUserId can be null if EPIN has no owner (admin -> user assignment).
 * Returns updated EPIN doc.
 */
export async function transferEPIN({ fromUserId = null, toUserId, code } = {}) {
  if (!toUserId) throw new Error("transferEPIN: missing toUserId");
  if (!code) throw new Error("transferEPIN: missing epin code");

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const epin = await EPIN.findOne({ code }).session(session);
    if (!epin) throw new Error("EPIN not found");
    if (epin.isUsed) throw new Error("Cannot transfer: EPIN already used");

    // owner check optional: allow transfer even if fromUserId not provided (unlimited transfer rule)
    if (fromUserId && epin.owner && String(epin.owner) !== String(fromUserId)) {
      // if provided a fromUser and doesn't match current owner -> reject
      throw new Error("transferEPIN: fromUserId does not match current owner");
    }

    // perform transfer
    epin.owner = toUserId;
    epin.lastTransferredAt = new Date();
    epin.transferCount = (epin.transferCount || 0) + 1;
    await epin.save({ session });

    await session.commitTransaction();
    session.endSession();
    return epin;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("transferEPIN error:", err);
    throw err;
  }
}

/**
 * Admin helper: get EPIN details
 */
export async function getEPIN(code) {
  if (!code) throw new Error("getEPIN: missing code");
  return EPIN.findOne({ code }).lean();
}

/**
 * List EPINs with filters (admin)
 * opts: { packageCode, owner, isUsed, limit, skip }
 */
export async function listEPINs(opts = {}) {
  const q = {};
  if (opts.packageCode) q.packageCode = opts.packageCode;
  if (typeof opts.owner !== "undefined") q.owner = opts.owner;
  if (typeof opts.isUsed !== "undefined") q.isUsed = opts.isUsed;
  const limit = Math.min(1000, opts.limit || 100);
  return EPIN.find(q).sort({ createdAt: -1 }).limit(limit).skip(opts.skip || 0).lean();
}

export default {
  generateEPINs,
  activateEPIN,
  transferEPIN,
  getEPIN,
  listEPINs
};
    
