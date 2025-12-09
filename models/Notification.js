// models/Notification.js
import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Notification model
 * - type: 'income'|'rank'|'system'|'message' etc
 * - user: who receives (null => system broadcast)
 * - payload: small JSON
 * - read: boolean
 */

const NotificationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", default: null },
  type: { type: String, default: "system" },
  title: { type: String, required: true },
  message: { type: String, default: "" },
  payload: { type: Schema.Types.Mixed, default: {} },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

NotificationSchema.index({ user:1, read:1, createdAt:-1 });

export default mongoose.model("Notification", NotificationSchema);
