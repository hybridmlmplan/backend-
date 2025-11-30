import mongoose from "mongoose";

const purchaseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Package",
      required: true,
    },

    packageName: {
      type: String,
      enum: ["silver", "gold", "ruby"],
      required: true,
    },

    amount: { type: Number, required: true }, // package price
    pv: { type: Number, required: true },     // package PV
    bv: { type: Number, required: true },     // package BV

    prefix: { type: String, required: true }, // Sp/Gp/Rp

    paymentMethod: {
      type: String,
      enum: ["epin", "wallet", "admin"],
      default: "epin",
    },

    isUpgrade: { type: Boolean, default: false }, // Silver → Gold → Ruby
    isRenewal: { type: Boolean, default: false }, // yearly PV 1440

    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
    },

    activationDate: { type: Date },
    expiryDate: { type: Date },

    session: {
      type: String,
      enum: ["morning", "evening"],
      required: true, 
      // morning = 06:00–16:00
      // evening = 16:01–23:59
    },
  },
  { timestamps: true }
);

export default mongoose.model("Purchase", purchaseSchema);
