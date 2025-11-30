import mongoose from "mongoose";

const BVHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Source of BV
    type: {
      type: String,
      enum: [
        "activation",
        "repurchase",
        "renewal",
        "service",
        "auto-renewal",
        "admin-adjust",
      ],
      required: true,
    },

    bv: { type: Number, required: true },

    packageName: { type: String }, // silver / gold / ruby (optional)

    note: { type: String }, // optional custom message

    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const BVHistory = mongoose.model("BVHistory", BVHistorySchema);
export default BVHistory;
