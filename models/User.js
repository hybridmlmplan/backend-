import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    // ------------------------------
    // BASIC USER DETAILS
    // ------------------------------
    userId: { type: String, unique: true },
    name: String,

    email: { type: String }, // unlimited usage allowed (no unique)
    phone: { type: String }, // no unique, login by userId

    password: String,
    upiId: String,

    // ------------------------------
    // SPONSOR / REFERRAL / PLACEMENT
    // ------------------------------
    sponsorId: String,
    referralId: String,

    placementId: String, // optional
    placementSide: { type: String, enum: ["left", "right", null], default: null },

    // ------------------------------
    // JOINING / SESSION / STATUS
    // ------------------------------
    joinedDate: { type: Date, default: Date.now },

    session: { type: Number, default: 1 },

    status: { type: String, default: "inactive" },

    // ------------------------------
    // PACKAGE SYSTEM
    // ------------------------------
    currentPackage: { type: String, default: "none" },

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
    level: { type: String, default: "None" },
    rank: { type: String, default: "None" },

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
    // BINARY GENEALOGY TREE
    // ------------------------------
    parentId: { type: String, default: null },

    leftChild: { type: String, default: null },
    rightChild: { type: String, default: null },

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
    renewalDate: { type: Date, default: Date.now },
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
