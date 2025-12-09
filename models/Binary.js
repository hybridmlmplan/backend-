// models/Binary.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

/**
 * Binary (Pair) model — tracks pair events per session per package.
 *
 * Behavior:
 * - New pair records created as RED (status:'red')
 * - When both sides eligible and package active -> status becomes 'green' and payout occurs
 * - After payout, new pair record for next cycle can be created (cycleNumber++)
 */

const BinarySchema = new Schema({
  pairId: { type: String, unique: true, index: true }, // e.g. "P0001..."
  packageType: { type: String, enum: ['silver','gold','ruby'], required: true },

  sessionNumber: { type: Number, required: true }, // 1..8
  sessionDate: { type: Date, required: true },     // date of session (UTC or IST normalized)

  leftUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  rightUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

  status: { type: String, enum: ['red','green'], default: 'red', index: true }, // red = pending, green = paid/eligible
  cycleNumber: { type: Number, default: 1 }, // increments each reset cycle

  payoutAmount: { type: Number, default: 0 }, // stored at time of payout
  paid: { type: Boolean, default: false },
  paidAt: { type: Date, default: null },

  greenAt: { type: Date, default: null },

  notes: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes to speed session processing and pending queries
BinarySchema.index({ sessionDate: 1, sessionNumber: 1 });
BinarySchema.index({ status: 1, packageType: 1 });
BinarySchema.index({ leftUserId: 1 });
BinarySchema.index({ rightUserId: 1 });

export default mongoose.model('Binary', BinarySchema);
