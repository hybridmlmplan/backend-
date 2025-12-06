import mongoose from "mongoose";

const nomineeSchema = new mongoose.Schema({
  userId: String,
  nomineeName: String,
  relation: String,
  percentage: Number,
});

export default mongoose.model("Nominee", nomineeSchema);
