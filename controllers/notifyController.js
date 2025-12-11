// controllers/notifyController.js
// Full-featured Notification Controller (OPTION C)
// - DB notifications (Mongoose Notification model)
// - Admin broadcast
// - Targeted notifications
// - In-app socket emit (req.app.get('io'))
// - Optional Email (nodemailer) and SMS (twilio)
// - Exposed helpers for system events (pair paid, pending unlock, epin used, package activated, fund update, franchise sale)

// Usage:
// const notify = require('../controllers/notifyController');
// router.post('/notify/broadcast', adminAuth, notify.broadcastHandler);
// And from other services: await notify.notifyPairPaid({ pairId, req });

const mongoose = require('mongoose');
const { Types } = mongoose;
const Notification = require('../models/Notification');
const User = require('../models/User');
const PairRecord = require('../models/PairRecord');
const PendingUnlock = require('../models/PendingUnlock');
const Franchise = require('../models/Franchise');
const Settings = require('../models/Settings');

// optional transports
let transporter = null;
let twilioClient = null;
if (process.env.SMTP_HOST) {
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: (process.env.SMTP_SECURE === 'true'),
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
}
if (process.env.TWILIO_SID && process.env.TWILIO_TOKEN) {
  const twilio = require('twilio');
  twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
}

// Helper: send email (fire & forget)
async function sendEmail(to, subject, html) {
  if (!transporter || !to) return false;
  try {
    await transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, html });
    return true;
  } catch (err) {
    console.error('sendEmail error', err);
    return false;
  }
}

// Helper: send SMS (fire & forget)
async function sendSms(to, message) {
  if (!twilioClient || !to) return false;
  try {
    await twilioClient.messages.create({ body: message, from: process.env.TWILIO_FROM, to });
    return true;
  } catch (err) {
    console.error('sendSms error', err);
    return false;
  }
}

// Helper: emit in-app via socket.io (expects io set on express app: app.set('io', io))
function emitInApp(userId, payload, req) {
  try {
    if (!req || !req.app) return false;
    const io = req.app.get('io');
    if (!io) return false;
    // join-room convention: user:{userId}
    io.to(`user:${userId}`).emit('notification', payload);
    return true;
  } catch (err) {
    console.error('emitInApp error', err);
    return false;
  }
}

// Core: create a DB notification and optionally deliver (email/sms/inApp)
async function createNotification({
  toUserId,
  title,
  message,
  type = 'info',
  payload = {},
  deliver = { email: false, sms: false, inApp: true },
  req = null
}) {
  try {
    const doc = new Notification({
      user: Types.ObjectId(toUserId),
      title,
      message,
      type,
      payload,
      read: false,
      deleted: false,
      createdAt: new Date()
    });
    await doc.save();

    // in-app
    if (deliver.inApp && req) {
      emitInApp(toUserId, {
        id: doc._id.toString(),
        title,
        message,
        type,
        payload,
        createdAt: doc.createdAt
      }, req);
    }

    // fetch user contact if needed
    let user = null;
    if ((deliver.email || deliver.sms) && toUserId) {
      user = await User.findById(toUserId).select('email mobile name').lean();
    }

    // email
    if (deliver.email && user?.email) {
      sendEmail(user.email, title, `<p>${message}</p>`);
    }

    // sms
    if (deliver.sms && user?.mobile) {
      sendSms(user.mobile, `${title} - ${message}`);
    }

    return doc;
  } catch (err) {
    console.error('createNotification error', err);
    throw err;
  }
}

/* =========================
   Express handler functions
   ========================= */

/**
 * GET /notify/me
 * list notifications for current user (auth required)
 * query: page, limit, unreadOnly
 */
async function listMyNotifications(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(200, parseInt(req.query.limit || '25'));
    const skip = (page - 1) * limit;
    const filter = { user: Types.ObjectId(userId), deleted: { $ne: true } };
    if (req.query.unreadOnly === 'true') filter.read = false;

    const total = await Notification.countDocuments(filter);
    const rows = await Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();

    res.json({ ok: true, page, limit, total, notifications: rows });
  } catch (err) {
    console.error('listMyNotifications', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
}

/**
 * POST /notify/mark-read
 * body: { ids: [id1, id2, ...] }
 */
async function markRead(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(id => Types.ObjectId.isValid(id)) : [];
    if (!ids.length) return res.status(400).json({ ok: false, error: 'ids required' });

    const result = await Notification.updateMany(
      { _id: { $in: ids.map(id => Types.ObjectId(id)) }, user: Types.ObjectId(userId) },
      { $set: { read: true, readAt: new Date() } }
    );
    res.json({ ok: true, matched: result.n || result.matchedCount || 0 });
  } catch (err) {
    console.error('markRead', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
}

/**
 * POST /notify/mark-all-read
 */
async function markAllRead(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    await Notification.updateMany({ user: Types.ObjectId(userId), read: false }, { $set: { read: true, readAt: new Date() } });
    res.json({ ok: true });
  } catch (err) {
    console.error('markAllRead', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
}

/**
 * DELETE /notify/:id  (soft delete)
 */
async function deleteNotification(req, res) {
  try {
    const userId = req.user?.id;
    const id = req.params.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    if (!Types.ObjectId.isValid(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });

    const note = await Notification.findById(id);
    if (!note) return res.status(404).json({ ok: false, error: 'Not found' });
    if (note.user.toString() !== userId && !req.user.isAdmin) return res.status(403).json({ ok: false, error: 'Forbidden' });

    note.deleted = true;
    note.deletedAt = new Date();
    await note.save();
    res.json({ ok: true });
  } catch (err) {
    console.error('deleteNotification', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
}

/**
 * POST /notify/user/:id  (admin) - send targeted notification to a user
 * body: { title, message, type, deliver: { email, sms, inApp } , payload }
 */
async function notifyUserHandler(req, res) {
  try {
    if (!req.user?.isAdmin) return res.status(403).json({ ok: false, error: 'Admin required' });
    const uid = req.params.id;
    if (!Types.ObjectId.isValid(uid)) return res.status(400).json({ ok: false, error: 'Invalid user id' });

    const { title, message, type = 'system', payload = {}, deliver = { email: false, sms: false, inApp: true } } = req.body;
    if (!title || !message) return res.status(400).json({ ok: false, error: 'title & message required' });

    const user = await User.findById(uid).select('email mobile').lean();
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    const note = await createNotification({ toUserId: uid, title, message, type, payload, deliver, req });
    res.json({ ok: true, noteId: note._id });
  } catch (err) {
    console.error('notifyUserHandler', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
}

/**
 * POST /notify/broadcast  (admin)
 * body: { title, message, audience: 'all'|'all_active'|'package:Silver'|['id','id'] , deliver:{email,sms,inApp} }
 */
async function broadcastHandler(req, res) {
  try {
    if (!req.user?.isAdmin) return res.status(403).json({ ok: false, error: 'Admin required' });
    const { title, message, audience = 'all', deliver = { inApp: true, email: false, sms: false }, payload = {} } = req.body;
    if (!title || !message) return res.status(400).json({ ok: false, error: 'title & message required' });

    let cursor;
    if (audience === 'all') cursor = User.find({}).cursor();
    else if (audience === 'all_active') cursor = User.find({ packageActive: true }).cursor();
    else if (typeof audience === 'string' && audience.startsWith('package:')) {
      const pkg = audience.split(':')[1];
      cursor = User.find({ package: pkg }).cursor();
    } else if (Array.isArray(audience)) {
      const ids = audience.filter(id => Types.ObjectId.isValid(id)).map(id => Types.ObjectId(id));
      cursor = User.find({ _id: { $in: ids } }).cursor();
    } else {
      return res.status(400).json({ ok: false, error: 'Invalid audience' });
    }

    const created = [];
    for (let u = await cursor.next(); u != null; u = await cursor.next()) {
      try {
        const note = new Notification({
          user: u._id,
          title,
          message,
          type: 'broadcast',
          payload,
          read: false,
          createdAt: new Date()
        });
        await note.save();
        created.push(note._id);

        // deliveries (fire and forget)
        if (deliver.inApp && req) emitInApp(u._id.toString(), { id: note._id.toString(), title, message, payload }, req);
        if (deliver.email && u.email) sendEmail(u.email, title, `<p>${message}</p>`);
        if (deliver.sms && u.mobile) sendSms(u.mobile, `${title} - ${message}`);
      } catch (innerErr) {
        console.error('broadcast per-user error', innerErr);
        // continue with next user
      }
    }

    res.json({ ok: true, broadcasted: created.length });
  } catch (err) {
    console.error('broadcastHandler', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
}

/* =========================
   Event helper functions (to be called from elsewhere)
   These return boolean or Notification doc; they DO NOT do payouts
   ========================= */

/**
 * notifyPairPaid({ pairId, req })
 * Called when a silver pair is marked PAID by session engine
 */
async function notifyPairPaid({ pairId, req = null }) {
  try {
    const pair = await PairRecord.findById(pairId).lean();
    if (!pair) return null;
    const left = pair.left_user_id ? pair.left_user_id.toString() : null;
    const right = pair.right_user_id ? pair.right_user_id.toString() : null;
    const title = 'Pair Matched';
    const message = `A pair (ID: ${pairId}) has been matched and paid. Check your income page.`;

    const promises = [];
    if (left) promises.push(createNotification({ toUserId: left, title, message, type: 'pair_green', payload: { pairId }, deliver: { inApp: true, email: false }, req }));
    if (right) promises.push(createNotification({ toUserId: right, title, message, type: 'pair_green', payload: { pairId }, deliver: { inApp: true, email: false }, req }));
    const results = await Promise.allSettled(promises);
    return results;
  } catch (err) {
    console.error('notifyPairPaid', err);
    return null;
  }
}

/**
 * notifyPendingUnlock({ pendingId, req })
 * Called when a pending unlock is created (silver triggered)
 */
async function notifyPendingUnlock({ pendingId, req = null }) {
  try {
    const pu = await PendingUnlock.findById(pendingId).lean();
    if (!pu) return null;
    const base = await PairRecord.findById(pu.unlocked_on_silver_pair_id).lean();
    if (!base) return null;
    const left = base.left_user_id ? base.left_user_id.toString() : null;
    const right = base.right_user_id ? base.right_user_id.toString() : null;
    const pkgName = pu.package_id ? pu.package_id.toString() : pu.packageName || 'package';
    const title = `Pending Unlock: ${pkgName}`;
    const message = `A pending unlock for ${pkgName} was created on pair ${pu.unlocked_on_silver_pair_id}. Activate ${pkgName} to release.`;
    const promises = [];
    if (left) promises.push(createNotification({ toUserId: left, title, message, type: 'pending_unlock', payload: { pendingId }, deliver: { inApp: true }, req }));
    if (right) promises.push(createNotification({ toUserId: right, title, message, type: 'pending_unlock', payload: { pendingId }, deliver: { inApp: true }, req }));
    const results = await Promise.allSettled(promises);
    return results;
  } catch (err) {
    console.error('notifyPendingUnlock', err);
    return null;
  }
}

/**
 * notifyEpinUsed({ userId, epinCode, req })
 */
async function notifyEpinUsed({ userId, epinCode, req = null }) {
  try {
    const title = 'EPIN Used';
    const message = `Your EPIN ${epinCode} has been used and package activation recorded.`;
    const note = await createNotification({ toUserId: userId, title, message, type: 'epin', payload: { epinCode }, deliver: { inApp: true, email: true }, req });
    return note;
  } catch (err) {
    console.error('notifyEpinUsed', err);
    return null;
  }
}

/**
 * notifyPackageActivated({ userId, packageName, req })
 */
async function notifyPackageActivated({ userId, packageName, req = null }) {
  try {
    const title = 'Package Activated';
    const message = `Your package ${packageName} is now active. PV will be counted for binary matching.`;
    const note = await createNotification({ toUserId: userId, title, message, type: 'package', payload: { packageName }, deliver: { inApp: true, email: true }, req });
    return note;
  } catch (err) {
    console.error('notifyPackageActivated', err);
    return null;
  }
}

/**
 * notifyFundUpdate({ adminId, note, req })
 * Notifies admins (or configurable audience) when fund pools updated
 */
async function notifyFundUpdate({ adminId, note = '', req = null }) {
  try {
    // notify admins
    const admins = await User.find({ isAdmin: true }).select('_id email').lean();
    const title = 'Fund Pool Updated';
    const message = `Fund pools were updated by admin ${adminId}. ${note}`;
    const promises = admins.map(a => createNotification({ toUserId: a._id.toString(), title, message, type: 'fund', payload: {}, deliver: { inApp: true, email: true }, req }));
    const results = await Promise.allSettled(promises);
    return results;
  } catch (err) {
    console.error('notifyFundUpdate', err);
    return null;
  }
}

/**
 * notifyFranchiseSale({ franchiseId, productId, amount, req })
 */
async function notifyFranchiseSale({ franchiseId, productId, amount, req = null }) {
  try {
    const franchise = await Franchise.findOne({ franchiseId }).lean();
    if (!franchise) return null;
    const ownerId = franchise.userId ? franchise.userId.toString() : null;
    const title = 'Franchise Sale Recorded';
    const message = `Sale recorded for product ${productId}. Amount: ${amount}. Check franchise summary.`;
    if (ownerId) {
      const note = await createNotification({ toUserId: ownerId, title, message, type: 'franchise', payload: { productId, amount }, deliver: { inApp: true, email: true }, req });
      return note;
    }
    return null;
  } catch (err) {
    console.error('notifyFranchiseSale', err);
    return null;
  }
}

/* =========================
   Export handlers & helpers
   ========================= */
module.exports = {
  // express handlers
  listMyNotifications,
  markRead,
  markAllRead,
  deleteNotification,
  notifyUserHandler,
  broadcastHandler,

  // event helpers
  createNotification,
  notifyPairPaid,
  notifyPendingUnlock,
  notifyEpinUsed,
  notifyPackageActivated,
  notifyFundUpdate,
  notifyFranchiseSale
};
