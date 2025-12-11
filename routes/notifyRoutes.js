// routes/notifyRoutes.js
// Notification routes & helper functions for the Binary / MLM system
// - Works with Express + Mongoose
// - Supports: admin broadcast, targeted notify, user inbox (list/read/delete),
//   event helper functions to be invoked by other services (e.g., session engine, epin activate)
// - Optional delivery: Email (nodemailer), SMS (Twilio), In-App socket (req.app.get('io'))
//
// Requirements (models): Notification, User, PairRecord, PendingUnlock, Settings, Franchise
// You can adapt model field names if your schema differs.

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');     // user auth middleware
const admin = require('../middleware/admin');   // admin check middleware
const mongoose = require('mongoose');
const { Types } = mongoose;
const Notification = require('../models/Notification');
const User = require('../models/User');
const PendingUnlock = require('../models/PendingUnlock');
const PairRecord = require('../models/PairRecord');
const Settings = require('../models/Settings');
const Franchise = require('../models/Franchise');

const nodemailer = require('nodemailer'); // optional - configure .env
const twilio = require('twilio');         // optional - configure .env

// ---------- Helpers: Email & SMS (optional, safe fallbacks) ----------
const transporter = process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: (process.env.SMTP_SECURE === 'true'),
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  } : undefined
}) : null;

const twilioClient = (process.env.TWILIO_SID && process.env.TWILIO_TOKEN) ? twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN) : null;

async function sendEmail(to, subject, html) {
  if (!transporter) return false;
  try {
    await transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, html });
    return true;
  } catch (err) {
    console.error('sendEmail error', err);
    return false;
  }
}

async function sendSms(toNumber, message) {
  if (!twilioClient) return false;
  try {
    await twilioClient.messages.create({ body: message, from: process.env.TWILIO_FROM, to: toNumber });
    return true;
  } catch (err) {
    console.error('sendSms error', err);
    return false;
  }
}

// Emit in-app via socket if set on express app: app.set('io', io)
function emitInApp(userId, payload, req) {
  try {
    const io = req && req.app ? req.app.get('io') : null;
    if (!io) return false;
    // namespace / room logic - assume room per user 'user:{id}'
    io.to(`user:${userId}`).emit('notification', payload);
    return true;
  } catch (err) {
    console.error('emitInApp error', err);
    return false;
  }
}

// ---------- Core: createNotification helper ----------
// type: 'info' | 'pair_green' | 'pending_unlock' | 'epin' | 'package' | 'fund' | 'franchise' | 'system'
// payload: object (custom metadata, e.g., pairId, pendingId, epinCode, packageId)
async function createNotification({ toUserId, title, message, type = 'info', payload = {}, deliver = { email: false, sms: false, inApp: true }, req = null }) {
  try {
    const note = new Notification({
      user: Types.ObjectId(toUserId),
      title,
      message,
      type,
      payload,
      read: false,
      createdAt: new Date()
    });
    await note.save();

    // Try in-app emit
    if (deliver.inApp && req) emitInApp(toUserId, { id: note._id, title, message, type, payload, createdAt: note.createdAt }, req);

    // Send email if user has email and deliver.email true
    if (deliver.email) {
      const user = await User.findById(toUserId).select('email name mobile');
      if (user && user.email) {
        sendEmail(user.email, title, `<p>${message}</p>`);
      }
    }

    // Send SMS if deliver.sms true and mobile exists
    if (deliver.sms) {
      const user = await User.findById(toUserId).select('email name mobile');
      if (user && user.mobile) {
        sendSms(user.mobile, `${title} - ${message}`);
      }
    }

    return note;
  } catch (err) {
    console.error('createNotification error', err);
    throw err;
  }
}

// ========== ROUTES ==========

// GET /notify/me        -> list current user's notifications (paginated)
router.get('/me', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '25');
    const skip = (page - 1) * limit;

    const total = await Notification.countDocuments({ user: req.user.id });
    const notes = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({ page, limit, total, notifications: notes });
  } catch (err) {
    console.error('GET /notify/me', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /notify/:id       -> get single notification (only owner or admin)
router.get('/:id', auth, async (req, res) => {
  try {
    const id = req.params.id;
    if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

    const note = await Notification.findById(id);
    if (!note) return res.status(404).json({ error: 'Not found' });

    // owner or admin
    if (note.user.toString() !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json(note);
  } catch (err) {
    console.error('GET /notify/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /notify/mark-read  -> mark list of notifications as read
// body: { ids: [id1,id2,...] }
router.post('/mark-read', auth, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(id => Types.ObjectId.isValid(id)) : [];
    if (!ids.length) return res.status(400).json({ error: 'ids required' });

    await Notification.updateMany(
      { _id: { $in: ids }, user: Types.ObjectId(req.user.id) },
      { $set: { read: true, readAt: new Date() } }
    );

    res.json({ success: true, marked: ids.length });
  } catch (err) {
    console.error('POST /notify/mark-read', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /notify/mark-all-read
router.post('/mark-all-read', auth, async (req, res) => {
  try {
    await Notification.updateMany({ user: Types.ObjectId(req.user.id), read: false }, { $set: { read: true, readAt: new Date() } });
    res.json({ success: true });
  } catch (err) {
    console.error('POST /notify/mark-all-read', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /notify/:id   -> delete (soft delete) user's notification
router.delete('/:id', auth, async (req, res) => {
  try {
    const id = req.params.id;
    if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

    const note = await Notification.findById(id);
    if (!note) return res.status(404).json({ error: 'Not found' });
    if (note.user.toString() !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error: 'Forbidden' });

    note.deleted = true;
    note.deletedAt = new Date();
    await note.save();

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /notify/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- ADMIN BROADCAST (admin only) ----------
// POST /notify/broadcast
// body: { title, message, audience: 'all'|'all_active'|'package:Silver'|'users':[ids], deliver: { email, sms, inApp } }
router.post('/broadcast', auth, admin, async (req, res) => {
  try {
    const { title, message, audience = 'all', deliver = { email: false, sms: false, inApp: true } } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'title & message required' });

    let usersCursor;
    if (audience === 'all') usersCursor = User.find({}).cursor();
    else if (audience === 'all_active') usersCursor = User.find({ packageActive: true }).cursor();
    else if (audience.startsWith('package:')) {
      const pkg = audience.split(':')[1];
      usersCursor = User.find({ package: pkg }).cursor();
    } else if (Array.isArray(audience)) {
      usersCursor = User.find({ _id: { $in: audience.filter(id => Types.ObjectId.isValid(id)) } }).cursor();
    } else {
      return res.status(400).json({ error: 'Invalid audience' });
    }

    // iterate and create notifications in bulk (streaming)
    const created = [];
    for (let userDoc = await usersCursor.next(); userDoc != null; userDoc = await usersCursor.next()) {
      const u = userDoc;
      const note = new Notification({
        user: u._id,
        title,
        message,
        type: 'system',
        payload: {},
        read: false,
        createdAt: new Date()
      });
      await note.save();
      created.push(note._id);

      // attempt deliveries (fire-and-forget)
      if (deliver.inApp && req) emitInApp(u._id.toString(), { id: note._id, title, message, type: 'system' }, req);
      if (deliver.email && u.email) sendEmail(u.email, title, `<p>${message}</p>`);
      if (deliver.sms && u.mobile) sendSms(u.mobile, `${title} - ${message}`);
    }

    res.json({ success: true, broadcasted: created.length });
  } catch (err) {
    console.error('POST /notify/broadcast', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- TARGETED NOTIFICATIONS (admin) ----------
// POST /notify/user/:id    -> admin send specific notification to user
router.post('/user/:id', auth, admin, async (req, res) => {
  try {
    const uid = req.params.id;
    const { title, message, type = 'system', payload = {}, deliver = { email: false, sms: false, inApp: true } } = req.body;
    if (!Types.ObjectId.isValid(uid)) return res.status(400).json({ error: 'Invalid user id' });

    const user = await User.findById(uid).select('email mobile');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const note = new Notification({
      user: user._id,
      title, message, type, payload, createdAt: new Date()
    });
    await note.save();

    if (deliver.inApp) emitInApp(user._id.toString(), { id: note._id, title, message, type, payload }, req);
    if (deliver.email && user.email) sendEmail(user.email, title, `<p>${message}</p>`);
    if (deliver.sms && user.mobile) sendSms(user.mobile, `${title} - ${message}`);

    res.json({ success: true, noteId: note._id });
  } catch (err) {
    console.error('POST /notify/user/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- EVENT HELPERS (to be imported and used by other services) ----------

// 1) when silver pair becomes GREEN & PAID -> unlocks created for gold & ruby
// call: notifyPairPaid({ pairId, req })
async function notifyPairPaid({ pairId, req = null }) {
  try {
    const pair = await PairRecord.findById(pairId).lean();
    if (!pair) return null;
    // notify both users
    const left = pair.left_user_id ? pair.left_user_id.toString() : null;
    const right = pair.right_user_id ? pair.right_user_id.toString() : null;

    const title = 'Pair Matched: Silver';
    const message = `A silver pair matched and paid at position ${pairId}. Gold/Ruby pending unlocks (if any) are now visible.`;

    if (left) await createNotification({ toUserId: left, title, message, type: 'pair_green', payload: { pairId }, deliver: { inApp: true, email: false, sms: false }, req });
    if (right) await createNotification({ toUserId: right, title, message, type: 'pair_green', payload: { pairId }, deliver: { inApp: true, email: false, sms: false }, req });

    return true;
  } catch (err) {
    console.error('notifyPairPaid error', err);
    return false;
  }
}

// 2) when pending unlock created for a user (gold/ruby) -> notify the pair owners (they will see pending in UI)
async function notifyPendingUnlock({ pendingId, req = null }) {
  try {
    const pu = await PendingUnlock.findById(pendingId).lean();
    if (!pu) return null;
    // find base pair to get left/right users
    const base = await PairRecord.findById(pu.unlocked_on_silver_pair_id).lean();
    if (!base) return null;

    const title = `Pending Unlock: ${pu.package_id}`;
    const message = `A pending unlock for package (${pu.package_id}) was created for pair ${pu.unlocked_on_silver_pair_id}. Activate package to release.`;

    const left = base.left_user_id ? base.left_user_id.toString() : null;
    const right = base.right_user_id ? base.right_user_id.toString() : null;
    if (left) await createNotification({ toUserId: left, title, message, type: 'pending_unlock', payload: { pendingId }, deliver: { inApp: true }, req });
    if (right) await createNotification({ toUserId: right, title, message, type: 'pending_unlock', payload: { pendingId }, deliver: { inApp: true }, req });

    return true;
  } catch (err) {
    console.error('notifyPendingUnlock error', err);
    return false;
  }
}

// 3) when EPIN assigned/used -> notify user
// call: notifyEpinUsed({ userId, epinCode, req })
async function notifyEpinUsed({ userId, epinCode, req = null }) {
  try {
    const title = 'EPIN Used / Assigned';
    const message = `Your EPIN ${epinCode} has been used/assigned to your account and package activated.`;
    await createNotification({ toUserId: userId, title, message, type: 'epin', payload: { epinCode }, deliver: { inApp: true, email: true }, req });
    return true;
  } catch (err) {
    console.error('notifyEpinUsed error', err);
    return false;
  }
}

// 4) when package activated -> notify user
async function notifyPackageActivated({ userId, packageName, req = null }) {
  try {
    const title = 'Package Activated';
    const message = `Your package ${packageName} is now active. You will be eligible for binary pairing and PV will be counted.`;
    await createNotification({ toUserId: userId, title, message, type: 'package', payload: { packageName }, deliver: { inApp: true, email: true }, req });
    return true;
  } catch (err) {
    console.error('notifyPackageActivated error', err);
    return false;
  }
}

// 5) fund pool update -> notify selected admins or affected users (safe)
async function notifyFundUpdate({ adminId, note = '', req = null }) {
  try {
    // notify admins - find users with isAdmin flag
    const admins = await User.find({ isAdmin: true }).select('_id');
    const title = 'Fund Pool Updated';
    const message = `Fund pools updated by admin ${adminId}. ${note}`;
    for (const a of admins) {
      await createNotification({ toUserId: a._id.toString(), title, message, type: 'fund', deliver: { inApp: true, email: true }, req });
    }
    return true;
  } catch (err) {
    console.error('notifyFundUpdate error', err);
    return false;
  }
}

// 6) Franchise sale recorded -> notify franchise owner
async function notifyFranchiseSale({ franchiseId, productId, amount, req = null }) {
  try {
    const franchise = await Franchise.findOne({ franchiseId });
    if (!franchise) return null;
    const ownerId = franchise.userId ? franchise.userId.toString() : null;
    const title = 'Franchise Sale Recorded';
    const message = `A sale for product ${productId} was recorded. Amount: ${amount}. Check franchise summary for BV credits.`;
    if (ownerId) await createNotification({ toUserId: ownerId, title, message, type: 'franchise', payload: { productId, amount }, deliver: { inApp: true, email: true }, req });
    return true;
  } catch (err) {
    console.error('notifyFranchiseSale error', err);
    return false;
  }
}

// Export helpers to be used from other modules (session engine, epin activation, admin tools)
module.exports = router;
module.exports.createNotification = createNotification;
module.exports.notifyPairPaid = notifyPairPaid;
module.exports.notifyPendingUnlock = notifyPendingUnlock;
module.exports.notifyEpinUsed = notifyEpinUsed;
module.exports.notifyPackageActivated = notifyPackageActivated;
module.exports.notifyFundUpdate = notifyFundUpdate;
module.exports.notifyFranchiseSale = notifyFranchiseSale;
