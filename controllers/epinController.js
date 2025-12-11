// controllers/epinController.js
// EPIN lifecycle controller (generate, list, transfer, activate, validate, toggle token)
// Safe: does NOT perform payouts, only records package activation & PV ledger entry on EPIN use.

const mongoose = require('mongoose');
const { Types } = mongoose;
const EPIN = require('../models/EPIN');
const User = require('../models/User');
const Package = require('../models/Package');
const PVLedger = require('../models/PVLedger');
const Settings = require('../models/Settings');
// Optional notification service (if exists in your project)
let notify = null;
try { notify = require('../services/notifyService'); } catch (e) { /* optional */ }

const generateCode = (len = 18) => {
  // generate alphanumeric uppercase code
  return [...Array(len)].map(() => Math.random().toString(36)[2]).join('').toUpperCase();
};

module.exports = {
  /**
   * Admin: generate EPINs
   * body: { packageId, count }
   */
  generateEPINs: async (req, res) => {
    try {
      const adminId = req.admin?.id || null;
      const { packageId, count = 1 } = req.body;
      if (!packageId) return res.status(400).json({ ok: false, error: 'packageId required' });
      const pkg = await Package.findById(packageId).lean();
      if (!pkg) return res.status(404).json({ ok: false, error: 'Package not found' });

      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        const created = [];
        for (let i = 0; i < Number(count); i++) {
          const code = generateCode(18);
          const ep = new EPIN({
            code,
            packageId: pkg._id,
            packageName: pkg.name,
            status: 'UNUSED', // UNUSED | ASSIGNED | USED | TRANSFERABLE
            createdBy: adminId,
            createdAt: new Date()
          });
          await ep.save({ session });
          created.push({ id: ep._id, code: ep.code });
        }
        await session.commitTransaction();
        session.endSession();
        return res.json({ ok: true, generated: created.length, epins: created });
      } catch (err) {
        await session.abortTransaction().catch(() => {});
        session.endSession();
        throw err;
      }
    } catch (err) {
      console.error('generateEPINs', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  /**
   * Admin: list EPINs (filterable)
   * query: status, packageId, owner, page, perPage
   */
  listEPINs: async (req, res) => {
    try {
      const { status, packageId, owner, page = 1, perPage = 100 } = req.query;
      const filter = {};
      if (status) filter.status = status;
      if (packageId) filter.packageId = packageId;
      if (owner) {
        if (Types.ObjectId.isValid(owner)) filter.owner = Types.ObjectId(owner);
        else filter.owner = owner; // maybe userId
      }
      const skip = (Number(page) - 1) * Number(perPage);
      const total = await EPIN.countDocuments(filter);
      const rows = await EPIN.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(perPage)).lean();
      return res.json({ ok: true, meta: { page: Number(page), perPage: Number(perPage), total }, epins: rows });
    } catch (err) {
      console.error('listEPINs', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  /**
   * User: get my epins (owner == user)
   */
  myEPINs: async (req, res) => {
    try {
      const userId = req.user.id;
      const epins = await EPIN.find({ owner: Types.ObjectId(userId) }).sort({ createdAt: -1 }).lean();
      return res.json({ ok: true, epins });
    } catch (err) {
      console.error('myEPINs', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  /**
   * Transfer EPIN from current owner to another user (user-initiated or admin-initiated)
   * body: { code, toUserId } ; if admin call, req.admin present
   */
  transferEPIN: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const actorUserId = req.user?.id || null;
      const adminId = req.admin?.id || null;
      const { code, toUserId } = req.body;
      if (!code || !toUserId) {
        await session.abortTransaction(); session.endSession();
        return res.status(400).json({ ok: false, error: 'code & toUserId required' });
      }
      const ep = await EPIN.findOne({ code }).session(session);
      if (!ep) {
        await session.abortTransaction(); session.endSession();
        return res.status(404).json({ ok: false, error: 'EPIN not found' });
      }
      // Ownership check: if not admin, only owner can transfer
      if (!adminId) {
        if (!ep.owner || ep.owner.toString() !== actorUserId) {
          await session.abortTransaction(); session.endSession();
          return res.status(403).json({ ok: false, error: 'You are not owner of this EPIN' });
        }
      }
      if (ep.status === 'USED') {
        await session.abortTransaction(); session.endSession();
        return res.status(400).json({ ok: false, error: 'EPIN already used' });
      }

      const toUser = await User.findOne({ userId: toUserId }) || await User.findById(toUserId);
      if (!toUser) {
        await session.abortTransaction(); session.endSession();
        return res.status(404).json({ ok: false, error: 'Receiver user not found' });
      }

      ep.owner = toUser._id;
      ep.status = ep.status === 'UNUSED' ? 'ASSIGNED' : ep.status; // keep TRANSFERABLE if set
      ep.transferredAt = new Date();
      ep.transferredBy = adminId || actorUserId;
      await ep.save({ session });

      await session.commitTransaction();
      session.endSession();

      // optional notify
      try {
        if (notify && typeof notify.notifyEpinAssigned === 'function') {
          await notify.notifyEpinAssigned({ toUserId: toUser._id.toString(), code });
        }
      } catch (e) { /* ignore */ }

      return res.json({ ok: true, message: 'EPIN transferred', code, to: toUser.userId || toUser._id });
    } catch (err) {
      await session.abortTransaction().catch(() => {}); session.endSession();
      console.error('transferEPIN', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  /**
   * Admin: assign EPIN to user (explicit)
   * body: { code, userId }
   */
  assignEPIN: async (req, res) => {
    try {
      const { code, userId } = req.body;
      if (!code || !userId) return res.status(400).json({ ok: false, error: 'code & userId required' });

      const ep = await EPIN.findOne({ code });
      if (!ep) return res.status(404).json({ ok: false, error: 'EPIN not found' });
      if (ep.status === 'USED') return res.status(400).json({ ok: false, error: 'EPIN already used' });

      const user = await User.findOne({ userId }) || await User.findById(userId);
      if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

      ep.owner = user._id;
      ep.status = 'ASSIGNED';
      ep.assignedAt = new Date();
      ep.assignedBy = req.admin?.id || null;
      await ep.save();

      // optional notify
      try { if (notify && notify.notifyEpinAssigned) await notify.notifyEpinAssigned({ toUserId: user._id.toString(), code }); } catch (e) {}

      return res.json({ ok: true, message: 'EPIN assigned', code, user: user.userId || user._id });
    } catch (err) {
      console.error('assignEPIN', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  /**
   * Validate EPIN usability (public or user)
   * query: ?code=XXXX
   * returns: { valid: boolean, reason?, packageInfo? }
   */
  validateEPIN: async (req, res) => {
    try {
      const code = req.query.code || req.body.code;
      if (!code) return res.status(400).json({ ok: false, error: 'code required' });
      const ep = await EPIN.findOne({ code }).lean();
      if (!ep) return res.json({ ok: false, valid: false, reason: 'not_found' });

      // check token (epin ON/OFF)
      const settings = await Settings.findOne({}).lean();
      if (!settings?.epinToken) {
        return res.json({ ok: false, valid: false, reason: 'epin_token_off' });
      }

      if (ep.status === 'USED') return res.json({ ok: false, valid: false, reason: 'used' });
      // owner check not enforced here (we allow checking)
      const pkg = await Package.findById(ep.packageId).lean();
      return res.json({ ok: true, valid: true, epin: { code: ep.code, packageId: ep.packageId, packageName: ep.packageName, status: ep.status }, package: pkg || null });
    } catch (err) {
      console.error('validateEPIN', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  /**
   * User: activate package using EPIN (consumes EPIN, records PV ledger, activates package)
   * body: { code }
   *
   * Important: This does NOT trigger payouts. It only records activation and ledger entry for PV (session engine will pick it).
   */
  activateEPIN: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const userId = req.user.id;
      const { code } = req.body;
      if (!code) { await session.abortTransaction(); session.endSession(); return res.status(400).json({ ok: false, error: 'code required' }); }

      // check settings for epin token
      const settings = await Settings.findOne({}).session(session);
      if (!settings?.epinToken) {
        await session.abortTransaction(); session.endSession();
        return res.status(403).json({ ok: false, error: 'EPIN token is OFF' });
      }

      const ep = await EPIN.findOne({ code }).session(session);
      if (!ep) { await session.abortTransaction(); session.endSession(); return res.status(404).json({ ok: false, error: 'EPIN not found' }); }
      if (ep.status === 'USED') { await session.abortTransaction(); session.endSession(); return res.status(400).json({ ok: false, error: 'EPIN already used' }); }

      // if EPIN has owner, ensure current user is owner (or admin can bypass via separate endpoint)
      if (ep.owner && ep.owner.toString() !== userId) {
        await session.abortTransaction(); session.endSession();
        return res.status(403).json({ ok: false, error: 'You are not owner of this EPIN' });
      }

      const pkg = await Package.findById(ep.packageId).session(session);
      if (!pkg) { await session.abortTransaction(); session.endSession(); return res.status(404).json({ ok: false, error: 'Package not found for EPIN' }); }

      // Mark EPIN used
      ep.status = 'USED';
      ep.usedBy = Types.ObjectId(userId);
      ep.usedAt = new Date();
      ep.usedByAdmin = req.admin?.id || null;
      await ep.save({ session });

      // Update User package (simple)
      const user = await User.findById(userId).session(session);
      if (!user) { await session.abortTransaction(); session.endSession(); return res.status(404).json({ ok: false, error: 'User not found' }); }
      user.package = pkg.name;
      user.packageActive = true;
      user.packageActivatedAt = new Date();
      await user.save({ session });

      // Create PV ledger entry (session_id null — session engine will pick it up)
      const pvAmount = Number(pkg.pvValue || pkg.pv || 0);
      const pv = new PVLedger({
        userId: user._id,
        amount: pvAmount,
        source: 'EPIN_ACTIVATION',
        packageId: pkg._id,
        sessionId: null,
        createdAt: new Date()
      });
      await pv.save({ session });

      await session.commitTransaction();
      session.endSession();

      // optional notifications
      try {
        if (notify && typeof notify.notifyEpinUsed === 'function') {
          await notify.notifyEpinUsed({ userId: user._id.toString(), epinCode: code });
        }
        if (notify && typeof notify.notifyPackageActivated === 'function') {
          await notify.notifyPackageActivated({ userId: user._id.toString(), packageName: pkg.name });
        }
      } catch (e) { /* ignore */ }

      return res.json({ ok: true, message: 'Package activated (recorded). No payouts triggered.', package: pkg.name, pv: pvAmount });
    } catch (err) {
      await session.abortTransaction().catch(() => {}); session.endSession();
      console.error('activateEPIN', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  /**
   * Admin: toggle EPIN token (ON/OFF) in Settings
   * body: { enable: true|false }
   */
  toggleEPINToken: async (req, res) => {
    try {
      const { enable } = req.body;
      const s = await Settings.findOneAndUpdate({}, { $set: { epinToken: !!enable } }, { upsert: true, new: true });
      return res.json({ ok: true, epinToken: s.epinToken });
    } catch (err) {
      console.error('toggleEPINToken', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  /**
   * Admin: bulk import EPINs (array of codes with packageId)
   * body: { epins: [{code, packageId}, ...] }
   */
  bulkImportEPINs: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { epins } = req.body;
      if (!Array.isArray(epins) || !epins.length) { await session.abortTransaction(); session.endSession(); return res.status(400).json({ ok: false, error: 'epins array required' }); }

      const created = [];
      for (const item of epins) {
        if (!item.code || !item.packageId) continue;
        const pkg = await Package.findById(item.packageId).session(session);
        if (!pkg) continue;
        const exists = await EPIN.findOne({ code: item.code }).session(session);
        if (exists) continue;
        const ep = new EPIN({
          code: item.code,
          packageId: pkg._id,
          packageName: pkg.name,
          status: 'UNUSED',
          createdBy: req.admin?.id || null,
          createdAt: new Date()
        });
        await ep.save({ session });
        created.push(item.code);
      }

      await session.commitTransaction();
      session.endSession();
      return res.json({ ok: true, created: created.length, codes: created });
    } catch (err) {
      await session.abortTransaction().catch(() => {}); session.endSession();
      console.error('bulkImportEPINs', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  }
};
