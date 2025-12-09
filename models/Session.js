// models/Session.js
import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Session model
 * We have 8 sessions/day
 * Each session opens binary window
 * Pairs matched only inside same session
 */

const SessionSchema = new Schema({
  sessionNumber: { type: Number, required: true }, // 1 to 8
  date: { type: String, required: true }, // yyyy-mm-dd

  startTime: { type: Date },
  endTime: { type: Date },

  closed: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
});

// unique per day+session
SessionSchema.index({ date: 1, sessionNumber: 1 }, { unique: true });

export default mongoose.model("Session", SessionSchema);
