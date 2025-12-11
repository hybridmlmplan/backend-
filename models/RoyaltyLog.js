// Backend/models/RoyaltyLog.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * RoyaltyLog
 * - हर royalty payout या accrual के लिये एक रिकॉर्ड
 * - plan के अनुसार CTO BV और rank-based royalty दोनों track करने के लिए fields दिए गए हैं
 */

const RoyaltyLogSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      description: "जिस user को royalty दी/allocate की गई (beneficiary)"
    },

    triggeredBy: {
      // कौनसे event / source ने यह royalty ट्रिगर की — e.g., "binary_pair", "repurchase_bv", "rank_upgrade", "cron_session"
      type: String,
      required: true,
      default: "system",
    },

    rankAtTime: {
      // user का rank जब royalty calculate हुई (star, silver_star, gold_star, ...)
      type: String,
      required: true,
      enum: [
        "star",
        "silver_star",
        "gold_star",
        "ruby_star",
        "emerald_star",
        "diamond_star",
        "crown_star",
        "ambassador_star",
        "company_star",
        "none"
      ],
      default: "none",
    },

    ctoBV: {
      // CTO BV amount जिस पर royalty percentage apply हुई (numeric BV)
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    percentage: {
      // applied percentage (e.g., 3, 1.1 etc) — store as plain number (not fraction)
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    amount: {
      // final computed payout amount in INR (or value unit) — after percentage applied on ctoBV (and any caps)
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    capApplied: {
      // अगर कोई cap लगाया गया हो (जैसे ₹10000 monthly cap), तो उसे true करें
      type: Boolean,
      default: false,
    },

    capReason: {
      // cap किस वजह से लगा — free text
      type: String,
      default: null,
    },

    relatedOrderId: {
      // optional reference to Order / Transaction (e.g., repurchase order) that generated this royalty
      type: Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },

    relatedSession: {
      // optional session identifier (string / ObjectId) — useful for session-based engines
      type: String,
      default: null,
    },

    status: {
      // log status — recorded / paid / pending / cancelled
      type: String,
      enum: ["recorded", "pending", "paid", "reversed", "cancelled"],
      default: "recorded",
      index: true,
    },

    remarks: {
      type: String,
      default: null,
    },

    meta: {
      // free JSON for any extra info (e.g., calculation breakdown, trace ids)
      type: Schema.Types.Mixed,
      default: {},
    },

    createdAt: {
      type: Date,
      default: () => new Date(),
      index: true,
    },

    updatedAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  {
    collection: "royalty_logs",
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
    strict: true,
  }
);

// Indexes to speed up queries by user & date & status
RoyaltyLogSchema.index({ userId: 1, createdAt: -1 });
RoyaltyLogSchema.index({ status: 1, createdAt: -1 });
RoyaltyLogSchema.index({ rankAtTime: 1, createdAt: -1 });

// Optional static helper: create a log (keeps creation logic in model)
RoyaltyLogSchema.statics.record = async function (payload = {}) {
  // payload must contain: userId, triggeredBy, rankAtTime, ctoBV, percentage, amount
  const required = ["userId", "triggeredBy", "rankAtTime", "ctoBV", "percentage", "amount"];
  for (const k of required) {
    if (typeof payload[k] === "undefined" || payload[k] === null) {
      throw new Error(`RoyaltyLog.record missing required field: ${k}`);
    }
  }
  return this.create(payload);
};

export default mongoose.model("RoyaltyLog", RoyaltyLogSchema);
