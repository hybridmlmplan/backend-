// backend/models/Registration.js
import mongoose from "mongoose";

const RegistrationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },

    // Personal details (duplicate minimal info to keep registration record immutable)
    fullName: { type: String, required: true },
    dob: { type: Date },
    gender: { type: String, enum: ["male", "female", "other"], default: "male" },

    // Documents (store file paths or urls)
    documents: {
      aadharFront: { type: String },
      aadharBack: { type: String },
      panCard: { type: String },
      profilePhoto: { type: String },
    },

    // Identity numbers
    aadharNumber: { type: String },
    panNumber: { type: String },

    // Bank / payout details
    bankDetails: {
      bankName: { type: String },
      accountNumber: { type: String },
      ifsc: { type: String },
      upiId: { type: String },
    },

    // KYC & admin fields
    kycStatus: {
      type: String,
      enum: ["not_submitted", "pending", "approved", "rejected"],
      default: "not_submitted",
    },
    kycSubmittedAt: { type: Date },
    kycReviewedAt: { type: Date },
    kycReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // admin who reviewed
    kycRemarks: { type: String },

    // Nominee
    nominee: {
      name: { type: String },
      relation: { type: String },
      phone: { type: String },
    },

    // Address
    address: {
      line1: { type: String },
      line2: { type: String },
      city: { type: String },
      state: { type: String },
      pincode: { type: String },
      country: { type: String, default: "India" },
    },

    // Registration flow control
    isRegistered: { type: Boolean, default: false }, // true once registration process complete (not signup)
    registrationStep: {
      type: String,
      enum: ["started", "kyc_uploaded", "kyc_pending", "kyc_approved", "complete"],
      default: "started",
    },

    // Package selection captured at registration (if user completed package selection here)
    packageAtRegistration: { type: String, enum: ["silver", "gold", "ruby", "none"], default: "none" },

    // Misc
    ipAddress: { type: String },
    deviceInfo: { type: String },

    // Soft flags for admin
    adminHold: { type: Boolean, default: false }, // admin can hold registration for manual review
  },
  { timestamps: true }
);

export default mongoose.model("Registration", RegistrationSchema);
