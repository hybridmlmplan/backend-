// models/WalletLedger.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * WalletLedger
 * - Stores every wallet-related transaction and ledger entry.
 * - Tracks type, source, pv/bv attribution, related order/session, and resulting balance.
 *
 * Usage notes (per your plan):
 * - binary incomes should set source: 'binary' and may include pvAmount (PV used).
 * - royalty/rank/fund incomes should set source: 'bv' and include bvAmount.
 * - withdrawals set type: 'debit', source: 'withdrawal'.
 * - admin adjustments set source: 'adjustment'.
 */

const WalletLedgerSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // credit | debit
    type: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
    },

    // numeric amount in paise/lowest currency unit is recommended; here using Number (INR)
    amount: { type: Number, required: true, min: 0 },

    // resulting wallet balance after applying this ledger entry (server should compute and set)
    balanceAfter: { type: Number, required: true },

    // high-level source of this wallet entry (map to your plan)
    source: {
      type: String,
      enum: [
        "binary",       // PV binary pair income (from PV)
        "rank",         // rank income (BV)
        "royalty",      // royalty (CTO BV etc)
        "level",        // level BV income
        "fund",         // fund payouts (car/house/travel)
        "franchise",    // franchise/referrer commissions
        "product",      // BV from product repurchase/purchase
        "epin",         // epin related
        "withdrawal",   // user withdrawal
        "deposit",      // deposit (gateway)
        "adjustment",   // admin adjustment
        "penalty",      // penalty/charge
        "other"
      ],
      default: "other",
      required: true,
      index: true,
    },

    // optional: separate PV / BV attribution (useful for reports)
    pvAmount: { type: Number, default: 0, min: 0 }, // PV used / matched (for binary)
    bvAmount: { type: Number, default: 0, min: 0 }, // BV for royalty/fund/rank

    // optional references to related entities
    relatedOrder: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    relatedBinary: { type: Schema.Types.ObjectId, ref: "Binary", default: null },
    relatedSession: { type: Schema.Types.ObjectId, ref: "Session", default: null },
    relatedRoyaltyLog: { type: Schema.Types.ObjectId, ref: "RoyaltyLog", default: null },

    // context/notes for admins or reconciliation
    description: { type: String, trim: true, default: "" },

    // payment provider metadata if deposit/withdrawal
    provider: {
      name: { type: String, trim: true },
      referenceId: { type: String, trim: true },
    },

    // whether entry is finalized/locked (prevents accidental edits)
    finalized: { type: Boolean, default: true, index: true },

    // soft-delete flag in case you want to hide entries from UI but keep for audit
    isDeleted: { type: Boolean, default: false, select: false },

    createdAt: { type: Date, default: Date.now, index: true },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  }
);

// Compound index to accelerate lookups by user + createdAt
WalletLedgerSchema.index({ user: 1, createdAt: -1 });

// Prevent negative balance entry at DB level is not reliable; ensure application enforces it.
// But we still add a validation hook to help catch accidental inserts.
WalletLedgerSchema.pre("validate", function (next) {
  if (this.amount < 0) {
    return next(new Error("WalletLedger: amount must be non-negative"));
  }
  if (!["credit", "debit"].includes(this.type)) {
    return next(new Error("WalletLedger: invalid type"));
  }
  next();
});

// Optional helper static: create ledger entry safely (recommended to call from walletService)
WalletLedgerSchema.statics.createEntry = async function ({
  userId,
  type,
  amount,
  balanceAfter,
  source = "other",
  pvAmount = 0,
  bvAmount = 0,
  relatedOrder = null,
  relatedBinary = null,
  relatedSession = null,
  description = "",
  provider = {},
  finalized = true,
}) {
  const entry = new this({
    user: userId,
    type,
    amount,
    balanceAfter,
    source,
    pvAmount,
    bvAmount,
    relatedOrder,
    relatedBinary,
    relatedSession,
    description,
    provider,
    finalized,
  });
  return entry.save();
};

const WalletLedger = mongoose.model("WalletLedger", WalletLedgerSchema);
export default WalletLedger;
