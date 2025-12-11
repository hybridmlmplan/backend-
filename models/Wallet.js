// backend/models/Wallet.js
import mongoose from "mongoose";
import Transaction from "./Transaction.js";      // existing model in your codebase
import WalletLedger from "./WalletLedger.js";    // existing ledger model

const { Schema } = mongoose;

/**
 * Wallet model
 * - one wallet per user
 * - currency in INR (numbers, stored as integer paise optional if you prefer)
 * - supports atomic credit/debit with ledger entries and transaction records
 */

const WalletSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },

    // Available withdrawable balance (INR)
    balance: { type: Number, required: true, default: 0 },

    // Pending / hold amount (for withdrawals or hold during processing)
    pending: { type: Number, required: true, default: 0 },

    // Cumulative totals (helpful for reporting)
    totalCredited: { type: Number, required: true, default: 0 },
    totalDebited: { type: Number, required: true, default: 0 },

    // Optional meta — e.g., currency code, lastUpdatedBy admin id, etc.
    currency: { type: String, default: "INR" },

    // Audit
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

/**
 * Static helper: get or create wallet for user
 */
WalletSchema.statics.getOrCreate = async function (userId) {
  let w = await this.findOne({ user: userId });
  if (!w) {
    w = await this.create({ user: userId, balance: 0, pending: 0 });
  }
  return w;
};

/**
 * Instance method: credit wallet atomically and create ledger + transaction
 * @param {Number} amount - positive number
 * @param {Object} options - { type: 'binary'|'royalty'|'fund'|..., refId, description, session }
 * Returns transaction document
 */
WalletSchema.methods.credit = async function (amount, options = {}) {
  if (!amount || amount <= 0) throw new Error("Invalid credit amount");
  const Wallet = this.constructor;
  const session = options.session || null;

  // Use mongoose transaction session if provided
  if (session) {
    // run as part of external transaction
    await Wallet.updateOne(
      { _id: this._id },
      {
        $inc: {
          balance: amount,
          totalCredited: amount,
        },
        $set: { updatedAt: new Date() },
      },
      { session }
    );

    // create Transaction & WalletLedger entries within same session
    const tx = await Transaction.create(
      [
        {
          user: this.user,
          wallet: this._id,
          type: "CREDIT",
          amount,
          method: options.type || "unknown",
          refId: options.refId || null,
          description: options.description || "Wallet credit",
          meta: options.meta || {},
        },
      ],
      { session }
    );

    await WalletLedger.create(
      [
        {
          user: this.user,
          wallet: this._id,
          tx: tx[0]._id,
          change: amount,
          balanceAfter: (this.balance + amount),
          type: "CREDIT",
          description: options.description || "Wallet credit",
        },
      ],
      { session }
    );

    return tx[0];
  } else {
    // no external session — use findOneAndUpdate atomically
    const updated = await Wallet.findOneAndUpdate(
      { _id: this._id },
      {
        $inc: { balance: amount, totalCredited: amount },
        $set: { updatedAt: new Date() },
      },
      { new: true }
    );

    // create transaction and ledger (not atomic across DB writes without session)
    const tx = await Transaction.create({
      user: this.user,
      wallet: this._id,
      type: "CREDIT",
      amount,
      method: options.type || "unknown",
      refId: options.refId || null,
      description: options.description || "Wallet credit",
      meta: options.meta || {},
    });

    await WalletLedger.create({
      user: this.user,
      wallet: this._id,
      tx: tx._id,
      change: amount,
      balanceAfter: updated.balance,
      type: "CREDIT",
      description: options.description || "Wallet credit",
    });

    // refresh instance fields
    this.balance = updated.balance;
    this.totalCredited = updated.totalCredited;
    this.updatedAt = updated.updatedAt;
    return tx;
  }
};

/**
 * Instance method: debit wallet atomically (ensures sufficient balance) and create ledger + transaction
 * @param {Number} amount - positive number
 * @param {Object} options - { type: 'withdraw'|'binary_payout'|'fee', refId, description, session }
 */
WalletSchema.methods.debit = async function (amount, options = {}) {
  if (!amount || amount <= 0) throw new Error("Invalid debit amount");
  const Wallet = this.constructor;
  const session = options.session || null;

  if (session) {
    // optimistic check within transaction: ensure balance >= amount
    const fresh = await Wallet.findOne({ _id: this._id }).session(session).exec();
    if (!fresh) throw new Error("Wallet not found");
    if (fresh.balance < amount) throw new Error("Insufficient wallet balance");

    await Wallet.updateOne(
      { _id: this._id },
      {
        $inc: { balance: -amount, totalDebited: amount },
        $set: { updatedAt: new Date() },
      },
      { session }
    );

    const tx = await Transaction.create(
      [
        {
          user: this.user,
          wallet: this._id,
          type: "DEBIT",
          amount,
          method: options.type || "unknown",
          refId: options.refId || null,
          description: options.description || "Wallet debit",
          meta: options.meta || {},
        },
      ],
      { session }
    );

    await WalletLedger.create(
      [
        {
          user: this.user,
          wallet: this._id,
          tx: tx[0]._id,
          change: -amount,
          balanceAfter: fresh.balance - amount,
          type: "DEBIT",
          description: options.description || "Wallet debit",
        },
      ],
      { session }
    );

    return tx[0];
  } else {
    // without session: use findOneAndUpdate with precondition
    const updated = await Wallet.findOneAndUpdate(
      { _id: this._id, balance: { $gte: amount } },
      { $inc: { balance: -amount, totalDebited: amount }, $set: { updatedAt: new Date() } },
      { new: true }
    );

    if (!updated) throw new Error("Insufficient balance or wallet not found");

    const tx = await Transaction.create({
      user: this.user,
      wallet: this._id,
      type: "DEBIT",
      amount,
      method: options.type || "unknown",
      refId: options.refId || null,
      description: options.description || "Wallet debit",
      meta: options.meta || {},
    });

    await WalletLedger.create({
      user: this.user,
      wallet: this._id,
      tx: tx._id,
      change: -amount,
      balanceAfter: updated.balance,
      type: "DEBIT",
      description: options.description || "Wallet debit",
    });

    // refresh instance fields
    this.balance = updated.balance;
    this.totalDebited = updated.totalDebited;
    this.updatedAt = updated.updatedAt;
    return tx;
  }
};

/**
 * Place hold: move amount from balance -> pending (e.g., withdraw request)
 * Must ensure sufficient available balance.
 */
WalletSchema.methods.hold = async function (amount, options = {}) {
  if (!amount || amount <= 0) throw new Error("Invalid hold amount");
  const Wallet = this.constructor;
  const session = options.session || null;

  if (session) {
    const fresh = await Wallet.findOne({ _id: this._id }).session(session).exec();
    if (!fresh) throw new Error("Wallet not found");
    if (fresh.balance < amount) throw new Error("Insufficient balance to hold");

    await Wallet.updateOne(
      { _id: this._id },
      { $inc: { balance: -amount, pending: amount }, $set: { updatedAt: new Date() } },
      { session }
    );

    // ledger / transaction optional
    const tx = await Transaction.create(
      [
        {
          user: this.user,
          wallet: this._id,
          type: "HOLD",
          amount,
          method: options.type || "hold",
          refId: options.refId || null,
          description: options.description || "Amount held",
          meta: options.meta || {},
        },
      ],
      { session }
    );

    await WalletLedger.create(
      [
        {
          user: this.user,
          wallet: this._id,
          tx: tx[0]._id,
          change: -amount,
          balanceAfter: fresh.balance - amount,
          type: "HOLD",
          description: options.description || "Amount held",
        },
      ],
      { session }
    );

    return tx[0];
  } else {
    const updated = await Wallet.findOneAndUpdate(
      { _id: this._id, balance: { $gte: amount } },
      { $inc: { balance: -amount, pending: amount }, $set: { updatedAt: new Date() } },
      { new: true }
    );
    if (!updated) throw new Error("Insufficient balance to hold");

    const tx = await Transaction.create({
      user: this.user,
      wallet: this._id,
      type: "HOLD",
      amount,
      method: options.type || "hold",
      refId: options.refId || null,
      description: options.description || "Amount held",
      meta: options.meta || {},
    });

    await WalletLedger.create({
      user: this.user,
      wallet: this._id,
      tx: tx._id,
      change: -amount,
      balanceAfter: updated.balance,
      type: "HOLD",
      description: options.description || "Amount held",
    });

    this.balance = updated.balance;
    this.pending = updated.pending;
    return tx;
  }
};

/**
 * Release hold (move from pending -> balance or pending -> debit)
 * mode: 'release' => return to balance, 'finalize' => deduct from pending (e.g., payout)
 */
WalletSchema.methods.releaseHold = async function (amount, mode = "release", options = {}) {
  if (!amount || amount <= 0) throw new Error("Invalid release amount");
  const Wallet = this.constructor;
  const session = options.session || null;

  if (session) {
    const fresh = await Wallet.findOne({ _id: this._id }).session(session).exec();
    if (!fresh) throw new Error("Wallet not found");
    if (fresh.pending < amount) throw new Error("Insufficient pending amount");

    if (mode === "release") {
      await Wallet.updateOne(
        { _id: this._id },
        { $inc: { pending: -amount, balance: amount }, $set: { updatedAt: new Date() } },
        { session }
      );
    } else if (mode === "finalize") {
      // finalize means pending removed permanently (e.g., withdrawal paid out)
      await Wallet.updateOne(
        { _id: this._id },
        { $inc: { pending: -amount, totalDebited: amount }, $set: { updatedAt: new Date() } },
        { session }
      );
    } else {
      throw new Error("Invalid release mode");
    }

    const tx = await Transaction.create(
      [
        {
          user: this.user,
          wallet: this._id,
          type: mode === "release" ? "HOLD_RELEASE" : "HOLD_FINALIZE",
          amount,
          method: options.type || mode,
          refId: options.refId || null,
          description: options.description || `Hold ${mode}`,
          meta: options.meta || {},
        },
      ],
      { session }
    );

    await WalletLedger.create(
      [
        {
          user: this.user,
          wallet: this._id,
          tx: tx[0]._id,
          change: mode === "release" ? amount : -0, // ledger shows balance change for release
          balanceAfter: mode === "release" ? fresh.balance + amount : fresh.balance,
          type: mode === "release" ? "HOLD_RELEASE" : "HOLD_FINALIZE",
          description: options.description || `Hold ${mode}`,
        },
      ],
      { session }
    );

    return tx[0];
  } else {
    // non-session flow
    const fresh = await Wallet.findOne({ _id: this._id });
    if (!fresh) throw new Error("Wallet not found");
    if (fresh.pending < amount) throw new Error("Insufficient pending amount");

    if (mode === "release") {
      const updated = await Wallet.findOneAndUpdate(
        { _id: this._id, pending: { $gte: amount } },
        { $inc: { pending: -amount, balance: amount }, $set: { updatedAt: new Date() } },
        { new: true }
      );
      const tx = await Transaction.create({
        user: this.user,
        wallet: this._id,
        type: "HOLD_RELEASE",
        amount,
        method: options.type || "release",
        refId: options.refId || null,
        description: options.description || "Hold release",
        meta: options.meta || {},
      });
      await WalletLedger.create({
        user: this.user,
        wallet: this._id,
        tx: tx._id,
        change: amount,
        balanceAfter: updated.balance,
        type: "HOLD_RELEASE",
        description: options.description || "Hold release",
      });
      this.balance = updated.balance;
      this.pending = updated.pending;
      return tx;
    } else if (mode === "finalize") {
      const updated = await Wallet.findOneAndUpdate(
        { _id: this._id, pending: { $gte: amount } },
        { $inc: { pending: -amount, totalDebited: amount }, $set: { updatedAt: new Date() } },
        { new: true }
      );
      const tx = await Transaction.create({
        user: this.user,
        wallet: this._id,
        type: "HOLD_FINALIZE",
        amount,
        method: options.type || "finalize",
        refId: options.refId || null,
        description: options.description || "Hold finalize",
        meta: options.meta || {},
      });
      await WalletLedger.create({
        user: this.user,
        wallet: this._id,
        tx: tx._id,
        change: 0,
        balanceAfter: updated.balance,
        type: "HOLD_FINALIZE",
        description: options.description || "Hold finalize",
      });
      this.pending = updated.pending;
      this.totalDebited = updated.totalDebited;
      return tx;
    } else {
      throw new Error("Invalid release mode");
    }
  }
};

/**
 * Simple helper to get current balance
 */
WalletSchema.methods.getBalance = function () {
  return {
    balance: this.balance,
    pending: this.pending,
    totalCredited: this.totalCredited,
    totalDebited: this.totalDebited,
  };
};

/**
 * Indexes for quicker lookup
 */
WalletSchema.index({ user: 1 });

export default mongoose.model("Wallet", WalletSchema);
