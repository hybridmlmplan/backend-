import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  userId: { type: String, unique: true }, // GSM0001

  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String }, // multiple time use allowed

  password: { type: String, required: true },

  sponsorId: { type: String, required: true }, // parent
  placementId: { type: String }, // blank allowed
  placementSide: { type: String, enum: ["left", "right"], required: true },

  package: {
    type: String,
    enum: ["silver", "gold", "ruby"],
    default: "inactive",
  },

  pv: { type: Number, default: 0 },
  bv: { type: Number, default: 0 },

  status: {
    type: String,
    enum: ["active", "inactive"],
    default: "inactive",
  },

  activationDate: { type: Date }, // backdate allowed
  createdAt: { type: Date, default: Date.now },

  rank: { type: String, default: "none" },
  level: { type: Number, default: 0 },

  walletBalance: { type: Number, default: 0 },

  leftCount: { type: Number, default: 0 },
  rightCount: { type: Number, default: 0 },

  leftPv: { type: Number, default: 0 },
  rightPv: { type: Number, default: 0 },
});

export default mongoose.model("User", userSchema);
