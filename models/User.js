const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    password: { type: String, required: true },
    role: { type: String, default: "user" },

    // MLM basic fields
    left: { type: String, default: null },
    right: { type: String, default: null },
    parentId: { type: String, default: null },
    placement: { type: String, default: null },
    prefix: { type: String, default: null },

    pv: { type: Number, default: 0 },
    bv: { type: Number, default: 0 },

    rank: { type: String, default: "Member" },

    wallet: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
