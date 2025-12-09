// controllers/notifyController.js
import Notification from "../models/Notification.js";
import { success, fail } from "../utils/response.js";

/**
 * Endpoints:
 * POST /api/notify/send   (admin) { userId|null, type, title, message, payload }
 * GET  /api/notify/my     (auth)  -> list user's notifications
 * POST /api/notify/read   (auth)  -> mark as read { id }
 */

export async function sendNotification(req, res) {
  try {
    const { userId = null, type = "system", title, message = "", payload = {} } = req.body;
    if (!title) return fail(res, "title required");
    const doc = await Notification.create({ user: userId, type, title, message, payload });
    return success(res, "Notification sent", doc);
  } catch (e) {
    console.error("sendNotification", e);
    return fail(res, "Server error");
  }
}

export async function myNotifications(req, res) {
  try {
    if (!req.user) return fail(res, "Auth required");
    const { limit = 50, skip = 0 } = req.query;
    const docs = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).skip(Number(skip)).limit(Number(limit)).lean();
    return success(res, "My notifications", docs);
  } catch (e) {
    console.error("myNotifications", e);
    return fail(res, "Server error");
  }
}

export async function markRead(req, res) {
  try {
    if (!req.user) return fail(res, "Auth required");
    const { id } = req.body;
    if (!id) return fail(res, "id required");
    await Notification.updateOne({ _id: id, user: req.user._id }, { $set: { read: true } });
    return success(res, "Marked read");
  } catch (e) {
    console.error("markRead", e);
    return fail(res, "Server error");
  }
}
