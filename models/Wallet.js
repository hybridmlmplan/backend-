import mongoose from "mongoose";

const walletSchema = new mongoose.Schema({
  userId: String,
  amount: { type: Number, default: 0 },
  history: [
    {
      amount: Number,
      type: String,
      remark: String,
      date: Date
    }
  ]
});

export default mongoose.model("Wallet", walletSchema);
