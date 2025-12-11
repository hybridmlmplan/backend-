// backend/models/EPIN.js
import mongoose from "mongoose";
import crypto from "crypto";

const { Schema } = mongoose;

/**
 * EPIN Schema
 *
 * Key business assumptions implemented here:
 * - EPIN does NOT expire (no expiry field)
 * - Unlimited transfers allowed (transferHistory array records each transfer)
 * - Token ON / OFF can be enforced at service/controller level; model stores `isActive` and `isLiveToken`
 * - Each pin is unique, indexed
 */

const TransferEntrySchema = new Schema(
  {
    from: { type: Schema.Types.ObjectId, ref: "User", default: null },
    to: { type: Schema.Types.ObjectId, ref: "User", required: true },
    transferredAt: { type: Date, default: Date.now },
    note: { type: String, default: "" }
  },
  { _id: false }
);

const EPINSchema = new Schema(
  {
    pin: { type: String, required: true, unique: true, index: true }, // e.g. hashed/random string
    packageCode: {
      type: String,
      enum: ["silver", "gold", "ruby"],
      required: true
    },
    value: { type: Number, required: true }, // monetary value or PV mapping if needed
    generatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }, // admin or system user
    generatedAt: { type: Date, default: Date.now },

    // ownership & usage
    owner: { type: Schema.Types.ObjectId, ref: "User", default: null }, // current holder (null = unassigned)
    assignedAt: { type: Date, default: null }, // when assigned to owner
    usedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }, // who consumed it to activate package
    usedAt: { type: Date, default: null },

    // flags
    isActive: { type: Boolean, default: true }, // pin enabled/disabled by admin
    isConsumed: { type: Boolean, default: false }, // once applied to activate package set true
    isLiveToken: { type: Boolean, default: false }, // token ON (live) / OFF (testing) — service checks this before allowing apply

    // transfer history: unlimited transfers allowed (kept for audit)
    transferHistory: { type: [TransferEntrySchema], default: [] },

    // optional meta / notes
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

// ---------- Static / Helper methods ----------

// Generate secure random pin string
EPINSchema.statics._generatePinString = function (len = 12) {
  // url-safe base64-like, remove non-alphanum
  return crypto.randomBytes(Math.ceil(len * 0.75)).toString("base64").replace(/\+/g, "0").replace(/\//g, "0").slice(0, len);
};

/**
 * Generate N EPIN documents
 * options: { count, packageCode, value, generatedBy, isLiveToken }
 */
EPINSchema.statics.generatePins = async function (options = {}) {
  const { count = 1, packageCode = "silver", value = 35, generatedBy = null, isLiveToken = false } = options;
  const pins = [];
  for (let i = 0; i < count; i++) {
    let pinStr = this._generatePinString(16);
    // ensure uniqueness (in rare collision case)
    while (await this.exists({ pin: pinStr })) {
      pinStr = this._generatePinString(16);
    }
    pins.push({
      pin: pinStr,
      packageCode,
      value,
      generatedBy,
      isLiveToken
    });
  }
  return this.insertMany(pins);
};

/**
 * Transfer a pin from one user to another.
 * Records transferHistory entry.
 * (Unlimited transfers allowed — no additional checks here)
 */
EPINSchema.statics.transferPin = async function (pinIdOrCode, fromUserId, toUserId, note = "") {
  const query = typeof pinIdOrCode === "string" && pinIdOrCode.length > 10 ? { pin: pinIdOrCode } : { _id: pinIdOrCode };
  const pinDoc = await this.findOne(query);
  if (!pinDoc) throw new Error("EPIN not found");

  // Optionally verify ownership if fromUserId provided
  if (fromUserId && String(pinDoc.owner) !== String(fromUserId)) {
    // allow transfer even if owner null (admin transfer), but if provided and mismatch -> error
    throw new Error("Transfer failed: fromUser does not own this EPIN");
  }

  pinDoc.transferHistory.push({
    from: fromUserId || null,
    to: toUserId,
    transferredAt: new Date(),
    note
  });

  pinDoc.owner = toUserId;
  pinDoc.assignedAt = new Date();
  await pinDoc.save();
  return pinDoc;
};

/**
 * Mark EPIN as used/consumed when user activates package with it.
 * Enforces: isActive && !isConsumed && isLiveToken if required by service.
 */
EPINSchema.statics.usePin = async function (pinCode, userId) {
  const pinDoc = await this.findOne({ pin: pinCode });
  if (!pinDoc) throw new Error("EPIN not found");
  if (!pinDoc.isActive) throw new Error("EPIN disabled");
  if (pinDoc.isConsumed) throw new Error("EPIN already used");
  // Note: permission to use live tokens should be checked at service (isLiveToken true => live mode)
  pinDoc.isConsumed = true;
  pinDoc.usedBy = userId;
  pinDoc.usedAt = new Date();
  // keep owner as userId (consumed by owner)
  pinDoc.owner = userId;
  await pinDoc.save();
  return pinDoc;
};

/**
 * Find an unassigned available pin (useful for auto-assign workflows)
 */
EPINSchema.statics.findAvailablePin = function (packageCode = "silver", isLiveToken = null) {
  const q = { isActive: true, isConsumed: false, owner: null, packageCode };
  if (isLiveToken !== null) q.isLiveToken = isLiveToken;
  return this.findOne(q).sort({ generatedAt: 1 });
};

const EPIN = mongoose.model("EPIN", EPINSchema);

export default EPIN;
