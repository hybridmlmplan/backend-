import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, unique: true }, // SP0001, GP0001, RP0001

    name: String,
    email: { type: String, unique: true },
    phone: { type: String, unique: true },
    password: String,
    upiId: String,

    // Binary + Level System
    sponsorId: String,
    referralId: String,
    placementSide: { type: String, enum: ["left", "right"] },

    joinedDate: Date,
    session: Number, // 1 or 2
    status: { type: String, default: "inactive" }, // active after Silver registration

    // Package System
    currentPackage: { type: String, default: "none" }, // silver/gold/ruby
    packageHistory: [
      {
        packageName: String,
        amount: Number,
        pv: Number,
        activationDate: Date,
      },
    ],

    // PV / BV System
    pv: { type: Number, default: 0 },
    bv: { type: Number, default: 0 },

    leftPV: { type: Number, default: 0 },
    rightPV: { type: Number, default: 0 },
    leftCarry: { type: Number, default: 0 },
    rightCarry: { type: Number, default: 0 },

    // Level System
    directCount: { type: Number, default: 0 },
    level: { type: Number, default: 0 }, // Star1, Star2, Star3 etc.
    rank: { type: String, default: "Star" },

    // Wallet Section
    wallet: {
      pairIncome: { type: Number, default: 0 },
      levelIncome: { type: Number, default: 0 },
      royaltyIncome: { type: Number, default: 0 },
      percentageIncome: { type: Number, default: 0 },
      fundIncome: { type: Number, default: 0 },
      nomineeIncome: { type: Number, default: 0 },
    },

    // Genealogy Tree System
    treeParent: String,
    treeChildren: { type: [String], default: [] },

    // Renewal System
    renewalDate: Date,
    extraPV: { type: Number, default: 0 },

    // KYC System
    kycStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    // Nominee Details
    nominee: {
      name: String,
      relation: String,
      phone: String,
    },

    // Address Details
    address: {
      line1: String,
      city: String,
      state: String,
      pincode: String,
    },

    // Document Uploads
    documents: {
      aadharFront: String,
      aadharBack: String,
      panCard: String,
      profilePhoto: String,
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
