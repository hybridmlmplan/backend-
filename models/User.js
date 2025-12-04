import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    // ------------------------------
    // BASIC USER DETAILS
    // ------------------------------
    userId: { type: String, unique: true }, // SP0001 / GP0001 / RP0001
    name: String,
    email: { type: String, unique: true },
    phone: { type: String, unique: true },
    password: String,
    upiId: String,

    // ------------------------------
    // SPONSOR / REFERRAL / PLACEMENT
    // ------------------------------
    sponsorId: String,
    referralId: String,

    // 🔥 FIXED (THIS WAS MISSING)
    placementId: String,

    placementSide: { type: String, enum: ["left", "right"] },

    // ------------------------------
    // JOINING / SESSION / STATUS
    // ------------------------------
    joinedDate: Date,
    session: { type: Number, required: true }, // 1 or 2
    status: { type: String, default: "inactive" }, // active after activation

    // ------------------------------
    // PACKAGE SYSTEM
    // ------------------------------
    currentPackage: { type: String, default: "none" }, // silver/gold/ruby

    packageHistory: [
      {
        packageName: String,
        amount: Number,
        pv: Number,
        activationDate: Date,
      },
    ],

    // ------------------------------
    // PV / BV SYSTEM
    // ------------------------------
    pv: { type: Number, default: 0 },
    bv: { type: Number, default: 0 },

    leftPV: { type: Number, default: 0 },
    rightPV: { type: Number, default: 0 },

    leftCarry: { type: Number, default: 0 },
    rightCarry: { type: Number, default: 0 },

    // ------------------------------
    // LEVEL / RANK SYSTEM
    // ------------------------------
    directCount: { type: Number, default: 0 },
    level: { type: String, default: "None" }, // Star1, Star2, Star3
    rank: { type: String, default: "None" }, // Silver Star → Company Star etc.

    // ------------------------------
    // WALLET SYSTEM
    // ------------------------------
    wallet: {
      pairIncome: { type: Number, default: 0 },
      levelIncome: { type: Number, default: 0 },
      royaltyIncome: { type: Number, default: 0 },
      percentageIncome: { type: Number, default: 0 },
      fundIncome: { type: Number, default: 0 },
    },

    // ------------------------------
    // BINARY GENEALOGY TREE (NEW)
    // ------------------------------
    parentId: { type: String, default: null },

    leftChild: { type: String, default: null },
    rightChild: { type: String, default: null },

    // ------------------------------
    // OPTIONAL TREE HISTORY (KEEPING YOUR OLD SYSTEM)
    // ------------------------------
    treeParent: String,

    treeChildren: {
      type: [
        {
          userId: String,
          placementSide: String,
          joinedDate: Date,
        },
      ],
      default: [],
    },

    // ------------------------------
    // RENEWAL SYSTEM
    // ------------------------------
    renewalDate: { type: Date, required: true }, // Always Silver join date
    extraPV: { type: Number, default: 0 },

    // ------------------------------
    // KYC SYSTEM
    // ------------------------------
    kycStatus: {
      type: String,
      enum: ["not-submitted", "pending", "approved", "rejected"],
      default: "not-submitted",
    },

    // ------------------------------
    // NOMINEE DETAILS
    // ------------------------------
    nominee: {
      name: String,
      relation: String,
      phone: String,
    },

    // ------------------------------
    // ADDRESS DETAILS
    // ------------------------------
    address: {
      line1: String,
      city: String,
      state: String,
      pincode: String,
    },

    // ------------------------------
    // DOCUMENT UPLOADS
    // ------------------------------
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
