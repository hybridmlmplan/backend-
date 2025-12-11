// controllers/packageController.js
// Package controller for MLM system (safe, record-only).
// Responsibilities:
//  - Admin: create / update / delete (soft) packages
//  - Admin: enable/disable package (visible/inactive)
//  - Public: list available packages
//  - Public: get package details
//  - Admin: set package PV/BV/pairIncome/capping values
//  - Helper: compute dailyMaxPairs (based on sessions config) — informational only
//
// NOTE: This file assumes Mongoose models exist:
//  - Package (fields used below)
//  - Settings (for sessions/daily caps) optionally
//
// Package model minimal fields assumed:
// {
//   name: String, price: Number, pv: Number, bv: Number,
//   pairIncome: Number, cappingPerSession: Number,
//   active: Boolean, description: String,
//   metadata: Object,
//   createdBy: ObjectId, updatedBy: ObjectId,
//   createdAt: Date, updatedAt: Date,
//   deleted: Boolean
// }
//

const mongoose = require('mongoose');
const { Types } = mongoose;
const Package = require('../models/Package');
const Settings = require('../models/Settings'); // optional, for session timing / counts

module.exports = {
  /**
   * Admin: create package
   * body: { name, price, pv, bv, pairIncome, cappingPerSession, description, metadata }
   */
  createPackage: async (req, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ ok: false, error: 'Admin required' });

      const { name, price, pv, bv, pairIncome, cappingPerSession = 1, description = '', metadata = {} } = req.body;
      if (!name) return res.status(400).json({ ok: false, error: 'name required' });
      if (typeof pv === 'undefined') return res.status(400).json({ ok: false, error: 'pv required' });
      if (typeof pairIncome === 'undefined') return res.status(400).json({ ok: false, error: 'pairIncome required' });

      // check unique name
      const exists = await Package.findOne({ name: name.trim() });
      if (exists) return res.status(400).json({ ok: false, error: 'Package with same name exists' });

      const pkg = new Package({
        name: name.trim(),
        price: Number(price || 0),
        pv: Number(pv),
        bv: Number(bv || 0),
        pairIncome: Number(pairIncome),
        cappingPerSession: Number(cappingPerSession),
        description: description || '',
        metadata: metadata || {},
        active: true,
        deleted: false,
        createdBy: req.user.id,
        createdAt: new Date()
      });

      await pkg.save();
      return res.json({ ok: true, package: pkg });
    } catch (err) {
      console.error('createPackage error', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  /**
   * Admin: update package
   * params: :id
   * body: any updatable package fields
   */
  updatePackage: async (req, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ ok: false, error: 'Admin required' });
      const id = req.params.id;
      if (!Types.ObjectId.isValid(id)) return res.status(400).json({ ok: false, error: 'Invalid package id' });

      const allowed = ['name', 'price', 'pv', 'bv', 'pairIncome', 'cappingPerSession', 'description', 'metadata', 'active'];
      const update = {};
      for (const key of allowed) {
        if (typeof req.body[key] !== 'undefined') update[key] = req.body[key];
      }
      if (Object.keys(update).length === 0) return res.status(400).json({ ok: false, error: 'No valid fields to update' });

      update.updatedBy = req.user.id;
      update.updatedAt = new Date();

      const pkg = await Package.findByIdAndUpdate(id, { $set: update }, { new: true });
      if (!pkg) return res.status(404).json({ ok: false, error: 'Package not found' });

      return res.json({ ok: true, package: pkg });
    } catch (err) {
      console.error('updatePackage error', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  /**
   * Admin: soft-delete package
   * params: :id
   */
  deletePackage: async (req, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ ok: false, error: 'Admin required' });
      const id = req.params.id;
      if (!Types.ObjectId.isValid(id)) return res.status(400).json({ ok: false, error: 'Invalid package id' });

      const pkg = await Package.findById(id);
      if (!pkg) return res.status(404).json({ ok: false, error: 'Package not found' });

      pkg.deleted = true;
      pkg.active = false;
      pkg.updatedBy = req.user.id;
      pkg.updatedAt = new Date();
      await pkg.save();

      return res.json({ ok: true, message: 'Package soft-deleted' });
    } catch (err) {
      console.error('deletePackage error', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  /**
   * Public: list packages
   * query: activeOnly=true/false, page, perPage, q
   */
  listPackages: async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page || '1'));
      const perPage = Math.min(200, parseInt(req.query.perPage || '50'));
      const skip = (page - 1) * perPage;
      const filter = { deleted: { $ne: true } };

      if (req.query.activeOnly === 'true' || req.query.activeOnly === true) filter.active = true;
      if (req.query.q) {
        const q = new RegExp(String(req.query.q), 'i');
        filter.$or = [{ name: q }, { description: q }];
      }

      const total = await Package.countDocuments(filter);
      const items = await Package.find(filter).sort({ pv: 1 }).skip(skip).limit(perPage).lean();

      return res.json({ ok: true, meta: { page, perPage, total }, packages: items });
    } catch (err) {
      console.error('listPackages error', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  /**
   * Public: get package by id or name
   * params: :id  (ObjectId or package name)
   */
  getPackage: async (req, res) => {
    try {
      const idOrName = req.params.id;
      if (!idOrName) return res.status(400).json({ ok: false, error: 'id or name required' });

      let pkg = null;
      if (Types.ObjectId.isValid(idOrName)) {
        pkg = await Package.findById(idOrName).lean();
      }
      if (!pkg) {
        pkg = await Package.findOne({ name: idOrName, deleted: { $ne: true } }).lean();
      }
      if (!pkg) return res.status(404).json({ ok: false, error: 'Package not found' });

      // optional: attach daily max pairs info from settings
      const settings = await Settings.findOne({}).lean().catch(() => null);
      let dailySessions = 8;
      if (settings?.dailySessions) dailySessions = Number(settings.dailySessions);
      const dailyMaxPairs = (pkg.cappingPerSession || 1) * dailySessions;

      pkg.info = pkg.info || {};
      pkg.info.dailyMaxPairs = dailyMaxPairs;

      return res.json({ ok: true, package: pkg });
    } catch (err) {
      console.error('getPackage error', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  /**
   * Admin: toggle package visibility (active/inactive)
   * params: :id
   * body: { active: true|false }
   */
  togglePackageActive: async (req, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ ok: false, error: 'Admin required' });
      const id = req.params.id;
      if (!Types.ObjectId.isValid(id)) return res.status(400).json({ ok: false, error: 'Invalid package id' });

      const { active } = req.body;
      if (typeof active === 'undefined') return res.status(400).json({ ok: false, error: 'active (true|false) required' });

      const pkg = await Package.findByIdAndUpdate(id, { $set: { active: !!active, updatedBy: req.user.id, updatedAt: new Date() } }, { new: true });
      if (!pkg) return res.status(404).json({ ok: false, error: 'Package not found' });

      return res.json({ ok: true, package: pkg });
    } catch (err) {
      console.error('togglePackageActive error', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  /**
   * Admin: set pairIncome or capping quickly (partial update)
   * params: :id
   * body: { pairIncome, cappingPerSession }
   */
  updatePairSettings: async (req, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ ok: false, error: 'Admin required' });
      const id = req.params.id;
      if (!Types.ObjectId.isValid(id)) return res.status(400).json({ ok: false, error: 'Invalid package id' });

      const { pairIncome, cappingPerSession } = req.body;
      const update = {};
      if (typeof pairIncome !== 'undefined') update.pairIncome = Number(pairIncome);
      if (typeof cappingPerSession !== 'undefined') update.cappingPerSession = Number(cappingPerSession);
      if (!Object.keys(update).length) return res.status(400).json({ ok: false, error: 'Nothing to update' });

      update.updatedBy = req.user.id;
      update.updatedAt = new Date();

      const pkg = await Package.findByIdAndUpdate(id, { $set: update }, { new: true });
      if (!pkg) return res.status(404).json({ ok: false, error: 'Package not found' });

      return res.json({ ok: true, package: pkg });
    } catch (err) {
      console.error('updatePairSettings error', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  /**
   * Admin: bulk import packages (array)
   * body: { packages: [{name, price, pv, bv, pairIncome, cappingPerSession, description, metadata}, ...] }
   */
  bulkImport: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      if (!req.user?.isAdmin) {
        await session.abortTransaction(); session.endSession();
        return res.status(403).json({ ok: false, error: 'Admin required' });
      }
      const incoming = Array.isArray(req.body.packages) ? req.body.packages : [];
      if (!incoming.length) {
        await session.abortTransaction(); session.endSession();
        return res.status(400).json({ ok: false, error: 'packages array required' });
      }

      const created = [];
      for (const p of incoming) {
        if (!p.name || typeof p.pv === 'undefined' || typeof p.pairIncome === 'undefined') continue;
        const exists = await Package.findOne({ name: p.name }).session(session);
        if (exists) continue;
        const pkg = new Package({
          name: p.name.trim(),
          price: Number(p.price || 0),
          pv: Number(p.pv),
          bv: Number(p.bv || 0),
          pairIncome: Number(p.pairIncome),
          cappingPerSession: Number(p.cappingPerSession || 1),
          description: p.description || '',
          metadata: p.metadata || {},
          active: true,
          deleted: false,
          createdBy: req.user.id,
          createdAt: new Date()
        });
        await pkg.save({ session });
        created.push(pkg._id);
      }

      await session.commitTransaction();
      session.endSession();

      return res.json({ ok: true, created: created.length });
    } catch (err) {
      await session.abortTransaction().catch(() => {}); session.endSession();
      console.error('bulkImport error', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  },

  /**
   * Public: get package metadata summary (for frontend)
   * Returns a compact representation suitable for UI (id, name, price, pv, pairIncome, capping, active)
   */
  publicSummary: async (req, res) => {
    try {
      const pkgs = await Package.find({ deleted: { $ne: true } }).select('name price pv pairIncome cappingPerSession active').sort({ pv: 1 }).lean();
      const summary = pkgs.map(p => ({
        id: p._id.toString(),
        name: p.name,
        price: p.price,
        pv: p.pv,
        pairIncome: p.pairIncome,
        cappingPerSession: p.cappingPerSession,
        active: !!p.active
      }));
      return res.json({ ok: true, packages: summary });
    } catch (err) {
      console.error('publicSummary error', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  }
};
