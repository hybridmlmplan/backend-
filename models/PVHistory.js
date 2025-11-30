import mongoose from "mongoose";

const PVHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // activation / repurchase / renewal / transfer / adjustment
    type: {
      type: String,
      enum: [
        "activation",
        "repurchase",
        "renewal",
        "auto-renewal",
        "transfer",
        "admin-adjust",
      ],
      required: true,
    },

    amount: { type: Number, required: true },

    packageName: { type: String }, // optional: Silver / Gold / Ruby

    note: { type: String }, // optional custom note

    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const PVHistory = mongoose.model("PVHistory", PVHistorySchema);
export default PVHistory;
