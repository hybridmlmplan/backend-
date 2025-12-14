import mongoose from "mongoose";

const binaryNodeSchema = new mongoose.Schema({
  userId: { type: String, unique: true },
  parentId: String,
  left: String,
  right: String
});

export default mongoose.model("BinaryNode", binaryNodeSchema);
