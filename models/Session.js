// backend/models/Session.js
// Session run / audit model for 8 daily sessions (per FINAL plan).
// Usage:
//  - Created by scheduler when a session run starts/finishes.
//  - Used by sessionScheduler.js and binaryEngine.js for idempotency and capping.

import mongoose from "mongoose";

const ProcessedPairSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  package: { type: String, enum: ["silver", "gold", "ruby"], required: true },
  amount: { type: Number, required: true },
  leftId: { type: mongoose.Schema.Types.ObjectId, ref: "Binary" },
  rightId: { type: mongoose.Schema.Types.ObjectId, ref: "Binary" },
  createdAt: { type: Date, default: () => new Date() }
}, { _id: false });

const ProcessedUserSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  // counts of pairs released in this session by package
  pairs: {
    silver: { type: Number, default: 0 },
    gold: { type: Number, default: 0 },
    ruby: { type: Number, default: 0 }
  }
}, { _id: false });

const SessionSchema = new mongoose.Schema({
  // dateKey groups daily sessions, format 'YYYY-MM-DD' (set by scheduler)
  dateKey: { type: String, required: true, index: true },
  sessionNumber: { type: Number, required: true, min: 1, max: 8, index: true }, // 1..8
  startTime: { type: Date, required: true },    // scheduler job start timestamp
  endTime: { type: Date },                      // when finished
  isCompleted: { type: Boolean, default: false },

  // audit: list of processed pairs for this session (detailed)
  processedPairs: { type: [ProcessedPairSchema], default: [] },

  // quick lookup for per-user per-package capping in this session
  processedUsers: { type: [ProcessedUserSchema], default: [] },

  // summary counts
  processedPairsCount: { type: Number, default: 0 },

  // optional notes / errors
  notes: { type: String, default: "" }
}, { timestamps: true });

// unique constraint: one sessionNumber per dateKey
SessionSchema.index({ dateKey: 1, sessionNumber: 1 }, { unique: true });

// Helper static: increment user's pair count in session (atomic at application level)
// Note: prefer using mongoose transactions around operations that modify Binary docs + Session
SessionSchema.statics.incrementUserPair = async function(sessionId, userId, pkg, pairObj, opts = {}) {
  // pairObj must contain leftId/rightId/amount
  // This helper pushes pair record and updates processedUsers.PACKAGE counter and processedPairsCount
  const update = [
    { $set: { updatedAt: new Date() } },
    {
      $push: { processedPairs: pairObj }
    },
    {
      $inc: { processedPairsCount: 1 }
    }
  ];

  // atomic update: try to increment user's package counter; if user entry not present, add it
  const sessionDoc = await this.findById(sessionId);
  if (!sessionDoc) throw new Error("Session not found");

  // find processedUsers entry
  const idx = sessionDoc.processedUsers.findIndex(pu => String(pu.userId) === String(userId));
  if (idx === -1) {
    // add new processedUser entry with that package count = 1
    const newEntry = {
      userId,
      pairs: { silver: 0, gold: 0, ruby: 0 }
    };
    newEntry.pairs[pkg] = 1;
    await this.updateOne({ _id: sessionId }, { $push: { processedUsers: newEntry }, $push: { processedPairs: pairObj }, $inc: { processedPairsCount: 1 } });
  } else {
    // increment existing package count
    const field = `processedUsers.${idx}.pairs.${pkg}`;
    await this.updateOne({ _id: sessionId }, { $inc: { [field]: 1, processedPairsCount: 1 }, $push: { processedPairs: pairObj } });
  }

  return true;
};

export default mongoose.model("Session", SessionSchema);
