import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  package: { type: String, default: null },
  sponsorId: String,
});

export default mongoose.model("User", userSchema);
