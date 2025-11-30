import mongoose from "mongoose";

const packageSchema = new mongoose.Schema(
  {
    packageName: { type: String, enum: ["silver", "gold", "ruby"], required: true },
    amount: { type: Number, required: true },
    pv: { type: Number, required: true },       // PV for activation
    bv: { type: Number, required: true },       // BV for percentage income / level income

    pairIncome: { type: Number, required: true },   // per pair income
    capping: { type: Number, required: true },       // daily pair limit

    prefix: { type: String, required: true },   // Sp / Gp / Rp

    // ranks auto handled by rankEngine (no need to store list here)
    isActive: { type: Boolean, default: true }, // admin can disable package
  },
  { timestamps: true }
);

export default mongoose.model("Package", packageSchema);
