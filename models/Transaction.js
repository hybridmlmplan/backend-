// backend/models/Transaction.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Transaction model
 * - Designed to handle all money movements (wallet credit/debit, pair payouts, royalty, fund distributions, epin purchases, franchise sales etc.)
 * - Fields tuned for auditing: balanceBefore, balanceAfter, meta ref ids, session reference, txId
 * - timestamps: createdAt and updatedAt
 */

const TransactionSchema = new Schema(
  {
    txId: { type: String, required: true, unique: true }, // unique transaction identifier (eg. TXYYYYMMDDXXXX)
    user: { type: Schema.Types.ObjectId, ref: "User", required: true }, // owner of this transaction
    amount: { type: Number, required: true, min: 0 }, // absolute amount (INR)
    // type: credit/debit relative to user's wallet
    type: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
    },
    // source explains which engine produced this transaction (important: PV binary vs BV incomes)
    source: {
      type: String,
      enum: [
        "binary_pair",      // PV based binary pair payout
        "royalty",          // royaltyEngine payouts (CTO BV rank-based)
        "rank_income",      // rank upgrade incomes
        "level_income",     // level BV incomes
        "fund_distribution",// car/house/travel fund distributions
        "epin_purchase",    // EPIN activation / purchase
        "package_purchase", // direct package purchase (order)
        "franchise_sale",   // franchise related BV
        "wallet_topup",     // manual or payment gateway topup
        "withdrawal",       // withdrawal to bank/UPI
        "adjustment",       // admin adjustments
        "refund",           // refunds
        "other",
      ],
      default: "other",
      required: true,
    },
    // BV vs PV marker (helps separate accounting)
    valueType: {
      type: String,
      enum: ["PV", "BV", "CASH"],
      required: true,
      default: "CASH",
    },
    description: { type: String }, // human readable note
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "reversed"],
      default: "completed",
    },

    // bookkeeping: balances for audit trail
    balanceBefore: { type: Number, required: true, default: 0 },
    balanceAfter: { type: Number, required: true, default: 0 },

    // Optional refs for traceability
    session: { type: Schema.Types.ObjectId, ref: "Session" }, // which session triggered this (for 8-sessions engine)
    binaryPair: { type: Schema.Types.ObjectId, ref: "Binary" }, // if binary_pair
    order: { type: Schema.Types.ObjectId, ref: "Order" }, // if package purchase
    epin: { type: Schema.Types.ObjectId, ref: "EPIN" }, // if epin related
    franchiseOrder: { type: Schema.Types.ObjectId, ref: "FranchiseOrder" },
    royaltyLog: { type: Schema.Types.ObjectId, ref: "RoyaltyLog" },

    // Extra metadata (JSON) to store engine-specific details (like level number, rank at time, CTO BV, etc.)
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
  }
);

// Indexes to speed up queries and reports
TransactionSchema.index({ user: 1, createdAt: -1 });
TransactionSchema.index({ txId: 1 });
TransactionSchema.index({ source: 1, createdAt: -1 });
TransactionSchema.index({ status: 1 });

// Pre-save guard: ensure balanceAfter consistent with type and amount if not already set by service
TransactionSchema.pre("save", function (next) {
  try {
    // If balanceBefore provided but balanceAfter not provided, compute best-effort
    if (this.isModified("amount") || this.isNew) {
      if (typeof this.balanceBefore === "number" && (this.balanceAfter === undefined || this.balanceAfter === null)) {
        if (this.type === "credit") this.balanceAfter = this.balanceBefore + this.amount;
        else if (this.type === "debit") this.balanceAfter = this.balanceBefore - this.amount;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
});

export default mongoose.models.Transaction || mongoose.model("Transaction", TransactionSchema);
