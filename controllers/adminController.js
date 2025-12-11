// controllers/adminController.js
// Safe Admin Controller for the MLM system (NO automated payouts).
// Provides:
//  - listUsers, getUser
//  - generateEPINs, assignEPIN, listEPINs
//  - activatePackage (record only: marks EPIN used, creates PV ledger entry)
//  - viewPendingUnlocks (read-only)
//  - sessionReport (read-only)
//  - updateConfig
//  - manualCredit (admin can create ledger credit record; does NOT auto-send money)
// NOTE: This controller assumes Mongoose models exist: User, EPIN, Package, PVLedger, PendingUnlock, SessionTracker, Config, WalletTransaction

const mongoose = require('mongoose');
const { Types } = mongoose;
const User = require('../models/User');
const EPIN = require('../models/EPIN');
const Package = require('../models/Package');
const PVLedger = require('../models/PVLedger');
const PendingUnlock = require('../models/PendingUnlock');
const SessionTracker = require('../models/SessionTracker');
const Config = require('../models/Config');
const WalletTransaction = require('../models/WalletTransaction');

const generateRandomCode = (len = 16) => {
  return [...Array(len)].map(() => Math.random().toString(36)[2]).join('').toUpperCase();
};

module.exports = {
  // ----------------------------
  // Users
  // ----------------------------
  listUsers: async (req, res) => {
    try {
      const { page = 1, perPage = 50, q } = req.query;
      const skip = (Number(page) - 1) * Number(perPage);
      const filter = {};
      if (q) {
        const like = new RegExp(q, 'i');
        filter.$or = [{ name: like }, { mobile: like }, { email: like }, { userId: like }];
      }
      const total = await User.countDocuments(filter);
      const users = await User.find(filter)
        .select('userId name mobile email sponsorId placementId package packageActive createdAt rank')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(perPage))
        .lean();
      res.json({ ok: true, meta: { page: Number(page), perPage: Number(perPage), total }, users });
    } catch (err) {
      console.error('listUsers', err);
      res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  getUser: async (req, res) => {
    try {
      const id = req.params.id;
      if (!Types.ObjectId.isValid(id)) return res.status(400).json({ ok: false, error: 'Invalid user id' });
      const user = await User.findById(id).lean();
      if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

      // basic package & wallet summary (wallet balance calc should be done via WalletTransaction aggregation)
      const walletAgg = await WalletTransaction.aggregate([
        { $match: { userId: user._id, status: { $ne: 'REVERSED' } } },
        {
          $group: {
            _id: null,
            credit: { $sum: { $cond: [{ $eq: ['$type', 'CREDIT'] }, '$amount', 0] } },
            debit: { $sum: { $cond: [{ $eq: ['$type', 'DEBIT'] }, '$amount', 0] } }
          }
        }
      ]);
      const credit = walletAgg[0]?.credit || 0;
      const debit = walletAgg[0]?.debit || 0;
      const balance = Number((credit - debit).toFixed(2));

      res.json({ ok: true, user, wallet: { balance } });
    } catch (err) {
      console.error('getUser', err);
      res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  // ----------------------------
  // EPINs
  // ----------------------------
  generateEPINs: async (req, res) => {
    try {
      const { packageId, count = 1 } = req.body;
      if (!packageId) return res.status(400).json({ ok: false, error: 'packageId required' });

      const pkg = await Package.findById(packageId).lean();
      if (!pkg) return res.status(404).json({ ok: false, error: 'Package not found' });

      const created = [];
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        for (let i = 0; i < Number(count); i++) {
          const code = generateRandomCode(18);
          const ep = new EPIN({
            code,
            packageId: pkg._id,
            packageName: pkg.name,
            status: 'UNUSED',
            createdBy: req.admin?.id || null,
            createdAt: new Date()
          });
          await ep.save({ session });
          created.push({ id: ep._id, code: ep.code });
        }
        await session.commitTransaction();
        session.endSession();
      } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
      }

      res.json({ ok: true, generated: created.length, epins: created });
    } catch (err) {
      console.error('generateEPINs', err);
      res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  listEPINs: async (req, res) => {
    try {
      const { status, page = 1, perPage = 100 } = req.query;
      const filter = {};
      if (status) filter.status = status;
      const skip = (Number(page) - 1) * Number(perPage);
      const total = await EPIN.countDocuments(filter);
      const epins = await EPIN.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(perPage)).lean();
      res.json({ ok: true, meta: { page: Number(page), perPage: Number(perPage), total }, epins });
    } catch (err) {
      console.error('listEPINs', err);
      res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  assignEPINToUser: async (req, res) => {
    try {
      const { code, userId } = req.body;
      if (!code || !userId) return res.status(400).json({ ok: false, error: 'code & userId required' });

      const ep = await EPIN.findOne({ code });
      if (!ep) return res.status(404).json({ ok: false, error: 'EPIN not found' });
      if (ep.status !== 'UNUSED' && ep.status !== 'TRANSFERABLE' && ep.status !== 'ASSIGNED') {
        return res.status(400).json({ ok: false, error: 'EPIN not assignable' });
      }

      const user = await User.findOne({ userId }) || await User.findById(userId);
      if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

      ep.owner = user._id;
      ep.status = 'ASSIGNED';
      ep.assignedAt = new Date();
      ep.assignedBy = req.admin?.id || null;
      await ep.save();

      res.json({ ok: true, message: 'EPIN assigned', epin: ep.code, user: user.userId || user._id });
    } catch (err) {
      console.error('assignEPINToUser', err);
      res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  // ----------------------------
  // Package Activation (ADMIN) - SAFE RECORDING
  // ----------------------------
  // Note: This records activation and creates PV ledger entry if EPIN used.
  // It DOES NOT trigger any automatic payouts or rank calculations.
  activatePackageForUser: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { userId, epinCode } = req.body;
      if (!userId || !epinCode) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ ok: false, error: 'userId & epinCode required' });
      }

      const user = await User.findOne({ userId }).session(session) || await User.findById(userId).session(session);
      if (!user) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ ok: false, error: 'User not found' });
      }

      const ep = await EPIN.findOne({ code: epinCode }).session(session);
      if (!ep) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ ok: false, error: 'EPIN not found' });
      }
      if (ep.status === 'USED') {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ ok: false, error: 'EPIN already used' });
      }

      const pkg = await Package.findById(ep.packageId).session(session);
      if (!pkg) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ ok: false, error: 'Package for EPIN not found' });
      }

      // mark EPIN used
      ep.status = 'USED';
      ep.usedBy = user._id;
      ep.usedAt = new Date();
      ep.usedByAdmin = req.admin?.id || null;
      await ep.save({ session });

      // create / update user package record (simple fields on user or separate user_packages model)
      user.package = pkg.name;
      user.packageActive = true;
      user.packageActivatedAt = new Date();
      await user.save({ session });

      // Add PV ledger entry (record only) - session_id left null for session engine to pick up
      const pv = new PVLedger({
        userId: user._id,
        amount: pkg.pvValue || pkg.pv || 0,
        source: 'PACKAGE_ACTIVATION',
        packageId: pkg._id,
        createdAt: new Date()
      });
      await pv.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.json({ ok: true, message: 'Package activated (recorded). No payouts triggered by this action.', userId: user.userId || user._id, package: pkg.name });
    } catch (err) {
      await session.abortTransaction().catch(() => {});
      session.endSession();
      console.error('activatePackageForUser', err);
      res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  // ----------------------------
  // Pending Unlocks (read-only)
  // ----------------------------
  listPendingUnlocks: async (req, res) => {
    try {
      const { status = 'PENDING', page = 1, perPage = 100 } = req.query;
      const skip = (Number(page) - 1) * Number(perPage);
      const filter = {};
      if (status) filter.status = status;
      const total = await PendingUnlock.countDocuments(filter);
      const rows = await PendingUnlock.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(perPage))
        .lean();
      res.json({ ok: true, meta: { page: Number(page), perPage: Number(perPage), total }, pending: rows });
    } catch (err) {
      console.error('listPendingUnlocks', err);
      res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  // ----------------------------
  // Session Reports (read-only)
  // ----------------------------
  getSessionReport: async (req, res) => {
    try {
      const sessionId = req.params.sessionId;
      if (!sessionId) return res.status(400).json({ ok: false, error: 'sessionId required' });

      const sessionRec = await SessionTracker.findOne({ sessionId }).lean();
      if (!sessionRec) return res.status(404).json({ ok: false, error: 'Session not found' });

      // For safety we only fetch summary & pair counts (do not compute payouts)
      const pairCounts = await PendingUnlock.aggregate([
        { $match: { unlockedOnSessionId: sessionId } },
        { $group: { _id: '$packageId', count: { $sum: 1 } } }
      ]);

      res.json({ ok: true, session: sessionRec, pairCounts });
    } catch (err) {
      console.error('getSessionReport', err);
      res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  // ----------------------------
  // Config update (admin)
  // ----------------------------
  updateConfig: async (req, res) => {
    try {
      const { key, value } = req.body;
      if (!key) return res.status(400).json({ ok: false, error: 'key required' });
      const updated = await Config.findOneAndUpdate({ key }, { value, updatedAt: new Date() }, { upsert: true, new: true });
      res.json({ ok: true, config: updated });
    } catch (err) {
      console.error('updateConfig', err);
      res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  // ----------------------------
  // Manual admin credit (record only) - safe
  // ----------------------------
  // Creates a WALLET transaction CREDIT (admin adjustment). No external payout.
  adminCredit: async (req, res) => {
    try {
      const { userId, amount, reference = 'admin-credit', note } = req.body;
      if (!userId || !amount) return res.status(400).json({ ok: false, error: 'userId & amount required' });

      const user = await User.findOne({ userId }) || await User.findById(userId);
      if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

      const tx = new WalletTransaction({
        userId: user._id,
        amount: Number(amount),
        type: 'CREDIT',
        reference,
        meta: { note, createdBy: req.admin?.id || null },
        status: 'COMPLETED',
        createdAt: new Date()
      });

      await tx.save();
      res.json({ ok: true, message: 'Admin credit recorded', txId: tx._id });
    } catch (err) {
      console.error('adminCredit', err);
      res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  // ----------------------------
  // Utility: health/check endpoint
  // ----------------------------
  health: async (req, res) => {
    try {
      res.json({ ok: true, service: 'admin-controller', time: new Date() });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Server error' });
    }
  }
};
