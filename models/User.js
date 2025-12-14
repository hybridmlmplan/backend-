import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: Number,
      unique: true,
      index: true
    },
    name: {
      type: String,
      required: true
    },
    mobile: {
      type: String,
      required: true
    },
    email: {
      type: String
    },
    password: {
      type: String,
      required: true
    },
    sponsorId: {
      type: Number,
      required: true
    },
    placementId: {
      type: Number,
      default: null
    },
    placement: {
      type: String,
      enum: ["L", "R"],
      default: "L"
    },
    package: {
      type: String,
      enum: ["none", "silver", "gold", "ruby"],
      default: "none"
    },
    isActive: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
