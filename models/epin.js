import mongoose from "mongoose";

const epinSchema = new mongoose.Schema({
  code: { type: String, unique: true },
  package: String,
  createdBy: String, // admin/user
  assignedTo: String, // userId
  usedBy: String,
  usedAt: Date,
  status: {
    type: String,
    enum: ["unused", "used"],
    default: "unused",
  },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Epin", epinSchema);
