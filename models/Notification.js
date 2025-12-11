// backend/models/Notification.js
import mongoose from "mongoose";

const { Schema, model } = mongoose;

/**
 * Notification model
 * Use-case: system notifications (pair income, BV/level/royalty, fund payouts, admin messages, EPIN events, etc.)
 *
 * Fields:
 *  - user: recipient user id (null for global/admin broadcasts)
 *  - type: short code (e.g. "pair_income","royalty","level_income","epin_used","admin","system")
 *  - title: short title shown to user
 *  - body: full message/content (may contain placeholders replaced on frontend)
 *  - meta: free-form object for structured data (txId, amount, package, sessionNumber, fromUserId, bv, pv, etc.)
 *  - read: boolean flag
 *  - readAt: timestamp when read
 *  - isGlobal: true for broadcast to all users (entry created once; admin can replicate logic)
 *  - createdAt: automatic
 *
 * Indexes:
 *  - user+createdAt for fast user inbox queries
 *  - isGlobal+createdAt for broadcast queries
 */

const NotificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: false, index: true }, // null => global/admin broadcast
    type: { type: String, required: true, trim: true, index: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    meta: { type: Schema.Types.Mixed, default: {} }, // txId, amount, package, sessionNumber, fromUserId, bv, pv...
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    isGlobal: { type: Boolean, default: false, index: true },
    // optional TTL for ephemeral notifications (e.g. temporary alerts). Not set by default.
    expiresAt: { type: Date, default: null }
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" }
  }
);

// Compound index to fetch user's newest notifications quickly
NotificationSchema.index({ user: 1, createdAt: -1 });
NotificationSchema.index({ isGlobal: 1, createdAt: -1 });

// Mark notification as read
NotificationSchema.methods.markRead = async function () {
  if (!this.read) {
    this.read = true;
    this.readAt = new Date();
    await this.save();
  }
  return this;
};

/**
 * createNotification helper
 * @param {Object} opts
 *  - user: userId (optional for global)
 *  - type: string (required)
 *  - title: string (required)
 *  - body: string (required)
 *  - meta: object (optional)
 *  - isGlobal: boolean (optional)
 *  - expiresAt: Date (optional)
 *
 * Usage: await createNotification({ user, type:'pair_income', title:'Pair Credited', body:'₹10 credited', meta:{ amount:10, package:'silver' } })
 */
NotificationSchema.statics.createNotification = async function (opts = {}) {
  const {
    user = null,
    type = "system",
    title = "Notification",
    body = "",
    meta = {},
    isGlobal = false,
    expiresAt = null
  } = opts;

  const doc = await this.create({
    user: user || null,
    type,
    title,
    body,
    meta,
    isGlobal,
    expiresAt
  });

  return doc;
};

/**
 * fetchUserNotifications
 * @param {ObjectId} userId
 * @param {Object} opts - { limit=20, skip=0, unreadOnly=false }
 * Returns merged list: user-specific + global (dedup by id)
 */
NotificationSchema.statics.fetchUserNotifications = async function (userId, opts = {}) {
  const { limit = 25, skip = 0, unreadOnly = false } = opts;

  const userQuery = { user: userId };
  if (unreadOnly) userQuery.read = false;

  const [userNotifs, globalNotifs] = await Promise.all([
    this.find(userQuery).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    this.find({ isGlobal: true }).sort({ createdAt: -1 }).limit(50).lean()
  ]);

  // Merge and sort by createdAt desc, avoid duplicates (unlikely)
  const map = new Map();
  [...globalNotifs, ...userNotifs].forEach((n) => {
    map.set(String(n._id), n);
  });

  const merged = Array.from(map.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return merged.slice(0, limit);
};

const Notification = model("Notification", NotificationSchema);

export default Notification;
