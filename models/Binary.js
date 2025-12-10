// backend/models/Binary.js
// Binary placement / pair item model
// - used by binaryEngine to create red nodes and mark them green when matched
// - fields aligned with your plan: userId, packageCode, side('L'|'R'), pv, isGreen, matchedWith, sessionMatched, matchedAt, placement info

import mongoose from "mongoose";

const BinarySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  packageCode: { type: String, enum: ["silver", "gold", "ruby"], required: true, index: true },
  side: { type: String, enum: ["L", "R"], required: true, index: true },

  // PV value for this node (35 / 155 / 1250)
  pv: { type: Number, required: true },

  // red/green state
  isGreen: { type: Boolean, default: false, index: true },

  // when matched to another binary node
  matchedWith: { type: mongoose.Schema.Types.ObjectId, ref: "Binary", default: null },
  sessionMatched: { type: Number, default: null }, // 1..8
  matchedAt: { type: Date, default: null },

  // placement / genealogy info (optional, helpful for tree logic)
  sponsorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  placementId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  placementSide: { type: String, enum: ["L", "R", null], default: null },

  // bookkeeping
  createdAt: { type: Date, default: () => new Date(), index: true },
  updatedAt: { type: Date, default: () => new Date() },

  // optional flags
  cycleResetKey: { type: String, default: null } // to mark cycles if needed by red/green reset logic
});

// update updatedAt on save
BinarySchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// convenience static: fetch earliest red node for user/package/side
BinarySchema.statics.findEarliestRed = function ({ userId, packageCode, side }) {
  return this.findOne({
    userId,
    packageCode,
    side,
    isGreen: false
  }).sort({ createdAt: 1 });
};

// convenience static: find earliest opposite red node across system (for matching different users)
BinarySchema.statics.findEarliestOpposite = function ({ packageCode, side, excludeId = null }) {
  const oppSide = side === "L" ? "R" : "L";
  const q = { packageCode, side: oppSide, isGreen: false };
  if (excludeId) q._id = { $ne: excludeId };
  return this.findOne(q).sort({ createdAt: 1 });
};

// instance helper: mark as green with matchedWith and session info
BinarySchema.methods.markAsGreen = async function (matchedBinaryId, sessionNumber, matchedAt = new Date()) {
  this.isGreen = true;
  this.matchedWith = matchedBinaryId;
  this.sessionMatched = sessionNumber;
  this.matchedAt = matchedAt;
  await this.save();
  return this;
};

// indexes to help aggregate queries (user/package/side/createdAt)
BinarySchema.index({ packageCode: 1, side: 1, isGreen: 1, createdAt: 1 });

export default mongoose.model("Binary", BinarySchema);
