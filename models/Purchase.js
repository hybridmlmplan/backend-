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
      required: true,              // "Silver", "Gold", "Ruby"
    },

    prefix: {
      type: String,
      required: true,              // "Sp" | "Gp" | "Rp"
    },

    amount: {
      type: Number,
      required: true,              // Package price
    },

    pv: {
      type: Number,
      required: true,              // Package PV (impact: PV Engine)
    },

    bv: {
      type: Number,
      required: true,              // Package BV (repurchase only, here for display)
    },

    paymentMethod: {
      type: String,
      enum: ["epin", "wallet", "admin"],
      default: "epin",
    },

    isUpgrade: {
      type: Boolean,
      default: false,              // Silver → Gold → Ruby
    },

    isRenewal: {
      type: Boolean,
      default: false,              // yearly 1440 PV rule
    },

    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
    },

    activationDate: {
      type: Date,
    },

    expiryDate: {
      type: Date,
    },

    session: {
      type: String,
      enum: ["morning", "evening"],
      required: true,               // required in GT70 pages
    },
  },
  { timestamps: true }
);

export default mongoose.model("Purchase", purchaseSchema);
