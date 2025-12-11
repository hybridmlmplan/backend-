// services/epinService.js
// EPIN service (safe): generate, list, find, assign, transfer, validate, activate (record-only).
//
// Expected Mongoose models:
//   EPIN: { code, packageId, packageName, status, owner, createdBy, createdAt, assignedAt, usedBy, usedAt, transferredAt, meta }
//   User: { _id, userId, name, email, package, packageActive, packageActivatedAt, ... }
//   Package: { _id, name, pvValue, pv, price, ... }
//   PVLedger: { userId, amount, source, packageId, sessionId, createdAt }
// 
// Important: This service DOES NOT perform any payouts or wallet credits. Activation records PV in PVLedger only.
// Use adminAuth/auth middleware at route level for admin-only endpoints.

const mongoose = require('mongoose');
const { Types } = mongoose;
const EPIN = require('../models/EPIN');
const User = require('../models/User');
const Package = require('../models/Package');
const PVLedger = require('../models/PVLedger');

const DEFAULT_CODE_LEN = 18;

function generateCode(len = DEFAULT_CODE_LEN) {
  return [...Array(len)].map(() => Math.random().toString(36)[2]).join('').toUpperCase();
}

/**
 * generateEPINs(adminId, packageId, count)
 * - Creates `count` EPIN documents for given package.
 * - Returns array of created EPIN docs (ids + codes).
 */
async function generateEPINs(adminId, packageId, count = 1) {
  if (!packageId) throw new Error('packageId required');
  if (Number(count) <= 0) throw new Error('count must be > 0');

  const pkg = await Package.findById(packageId).lean();
  if (!pkg) throw new Error('Package not found');

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const created = [];
    for (let i = 0; i < Number(count); i++) {
      const code = generateCode();
      const ep = new EPIN({
        code,
        packageId: pkg._id,
        packageName: pkg.name,
        status: 'UNUSED', // UNUSED | ASSIGNED | USED | TRANSFERABLE
        owner: null,
        createdBy: adminId || null,
        createdAt: new Date(),
        meta: {}
      });
      await ep.save({ session });
      created.push({ id: ep._id.toString(), code: ep.code });
    }
    await session.commitTransaction();
    session.endSession();
    return created;
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    session.endSession();
    throw err;
  }
}

/**
 * findEPIN(code)
 * - Returns EPIN doc or null
 */
async function findEPIN(code) {
  if (!code) throw new Error('code required');
  return EPIN.findOne({ code }).lean();
}

/**
 * listEPINs(filter, { page, perPage })
 * - filter supports: status, packageId, owner (userId or ObjectId)
 */
async function listEPINs(filter = {}, opts = {}) {
  const page = Math.max(1, Number(opts.page || 1));
  const perPage = Math.min(500, Number(opts.perPage || 100));
  const mongoFilter = {};

  if (filter.status) mongoFilter.status = filter.status;
  if (filter.packageId && Types.ObjectId.isValid(filter.packageId)) mongoFilter.packageId = Types.ObjectId(filter.packageId);
  if (filter.owner) {
    if (Types.ObjectId.isValid(filter.owner)) mongoFilter.owner = Types.ObjectId(filter.owner);
    else {
      // try find user by userId string
      const u = await User.findOne({ userId: filter.owner }).select('_id').lean();
      if (u) mongoFilter.owner = u._id;
      else mongoFilter.owner = null; // will match none
    }
  }

  const total = await EPIN.countDocuments(mongoFilter);
  const rows = await EPIN.find(mongoFilter).sort({ createdAt: -1 }).skip((page - 1) * perPage).limit(perPage).lean();
  return { meta: { page, perPage, total }, epins: rows };
}

/**
 * assignEPINToUser(code, userIdentifier, adminId)
 * - Assigns EPIN `code` to user (userIdentifier can be userId string or ObjectId)
 * - Marks status = ASSIGNED and sets owner
 */
async function assignEPINToUser(code, userIdentifier, adminId = null) {
  if (!code || !userIdentifier) throw new Error('code & userIdentifier required');

  const ep = await EPIN.findOne({ code });
  if (!ep) throw new Error('EPIN not found');

  if (ep.status === 'USED') throw new Error('EPIN already used');

  let user = null;
  if (Types.ObjectId.isValid(userIdentifier)) user = await User.findById(userIdentifier);
  else user = await User.findOne({ userId: userIdentifier });

  if (!user) throw new Error('User not found');

  ep.owner = user._id;
  ep.status = 'ASSIGNED';
  ep.assignedAt = new Date();
  ep.assignedBy = adminId || null;
  await ep.save();
  return { code: ep.code, assignedTo: user._id.toString() };
}

/**
 * transferEPIN(code, fromUserId, toUserId, actorId)
 * - Transfer EPIN ownership from fromUserId -> toUserId.
 * - actorId is who initiated (owner or admin). If actorId is not admin, ensure owner match.
 */
async function transferEPIN(code, fromUserId, toUserId, actorId = null, actorIsAdmin = false) {
  if (!code || !fromUserId || !toUserId) throw new Error('code, fromUserId & toUserId required');

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const ep = await EPIN.findOne({ code }).session(session);
    if (!ep) {
      await session.abortTransaction(); session.endSession();
      throw new Error('EPIN not found');
    }
    if (ep.status === 'USED') {
      await session.abortTransaction(); session.endSession();
      throw new Error('EPIN already used');
    }

    const fromObjId = Types.ObjectId.isValid(fromUserId) ? Types.ObjectId(fromUserId) : (await User.findOne({ userId: fromUserId }).select('_id').lean())?._id;
    const toObjId = Types.ObjectId.isValid(toUserId) ? Types.ObjectId(toUserId) : (await User.findOne({ userId: toUserId }).select('_id').lean())?._id;

    if (!fromObjId || !toObjId) {
      await session.abortTransaction(); session.endSession();
      throw new Error('fromUser or toUser not found');
    }

    // if not admin, ensure ep.owner === fromObjId
    if (!actorIsAdmin) {
      if (!ep.owner || ep.owner.toString() !== fromObjId.toString()) {
        await session.abortTransaction(); session.endSession();
        throw new Error('You are not owner of this EPIN');
      }
    }

    ep.owner = toObjId;
    // keep TRANSFERABLE status if previously set; otherwise mark ASSIGNED
    ep.status = ep.status === 'UNUSED' ? 'ASSIGNED' : ep.status;
    ep.transferredAt = new Date();
    ep.transferredBy = actorId || null;
    await ep.save({ session });

    await session.commitTransaction();
    session.endSession();

    return { code: ep.code, to: toObjId.toString() };
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    session.endSession();
    throw err;
  }
}

/**
 * validateEPIN(code)
 * - Returns { valid:boolean, reason?, epin?, package? }
 */
async function validateEPIN(code) {
  if (!code) throw new Error('code required');
  const ep = await EPIN.findOne({ code }).lean();
  if (!ep) return { valid: false, reason: 'not_found' };

  // token on/off logic (if you store in Settings)
  // We won't fail if settings missing; assume enabled unless Settings.epinToken === false
  try {
    const Settings = require('../models/Settings');
    const settings = await Settings.findOne({}).lean();
    if (settings && settings.epinToken === false) {
      return { valid: false, reason: 'epin_token_off' };
    }
  } catch (e) {
    // ignore settings not present
  }

  if (ep.status === 'USED') return { valid: false, reason: 'used' };

  const pkg = await Package.findById(ep.packageId).lean().catch(() => null);
  return { valid: true, epin: ep, package: pkg || null };
}

/**
 * activateEPIN(code, userId, options)
 * - Marks EPIN used by userId (owner must be user unless admin override)
 * - Activates user's package (sets user.package fields)
 * - Creates PVLedger entry (source: EPIN_ACTIVATION) with pkg.pv or pvValue
 * - All done in a single transaction.
 *
 * options:
 *    { actorIsAdmin: boolean } -> if true, skip owner check
 */
async function activateEPIN(code, userId, options = {}) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!code || !userId) {
      await session.abortTransaction(); session.endSession();
      throw new Error('code & userId required');
    }

    const ep = await EPIN.findOne({ code }).session(session);
    if (!ep) {
      await session.abortTransaction(); session.endSession();
      throw new Error('EPIN not found');
    }
    if (ep.status === 'USED') {
      await session.abortTransaction(); session.endSession();
      throw new Error('EPIN already used');
    }

    const user = Types.ObjectId.isValid(userId) ? await User.findById(userId).session(session) : await User.findOne({ userId }).session(session);
    if (!user) {
      await session.abortTransaction(); session.endSession();
      throw new Error('User not found');
    }

    // owner enforcement
    if (!options.actorIsAdmin) {
      if (ep.owner && ep.owner.toString() !== user._id.toString()) {
        await session.abortTransaction(); session.endSession();
        throw new Error('You are not owner of this EPIN');
      }
    }

    const pkg = await Package.findById(ep.packageId).session(session);
    if (!pkg) {
      await session.abortTransaction(); session.endSession();
      throw new Error('Package not found for EPIN');
    }

    // mark EPIN used
    ep.status = 'USED';
    ep.usedBy = user._id;
    ep.usedAt = new Date();
    ep.usedByAdmin = options.actorIsAdmin ? (options.actorId || null) : null;
    await ep.save({ session });

    // update user's package (simple fields on user)
    user.package = pkg.name;
    user.packageActive = true;
    user.packageActivatedAt = new Date();
    await user.save({ session });

    // create PV ledger entry (sessionId: null — session engine picks it)
    const pvAmount = Number(pkg.pvValue || pkg.pv || 0);
    const pvDoc = new PVLedger({
      userId: user._id,
      amount: pvAmount,
      source: 'EPIN_ACTIVATION',
      packageId: pkg._id,
      sessionId: null,
      createdAt: new Date()
    });
    await pvDoc.save({ session });

    await session.commitTransaction();
    session.endSession();

    return { activated: true, userId: user._id.toString(), package: pkg.name, pv: pvAmount };
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    session.endSession();
    throw err;
  }
}

/**
 * bulkImport(epinsArray, adminId)
 * - epinsArray: [{ code, packageId }, ...] codes must be unique
 */
async function bulkImport(epinsArray = [], adminId = null) {
  if (!Array.isArray(epinsArray) || !epinsArray.length) throw new Error('epins array required');

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const created = [];
    for (const item of epinsArray) {
      if (!item.code || !item.packageId) continue;
      // skip existing
      const exists = await EPIN.findOne({ code: item.code }).session(session);
      if (exists) continue;
      const pkg = await Package.findById(item.packageId).session(session);
      if (!pkg) continue;
      const ep = new EPIN({
        code: item.code.toUpperCase(),
        packageId: pkg._id,
        packageName: pkg.name,
        status: 'UNUSED',
        owner: item.owner || null,
        createdBy: adminId || null,
        createdAt: new Date(),
        meta: item.meta || {}
      });
      await ep.save({ session });
      created.push(ep.code);
    }
    await session.commitTransaction();
    session.endSession();
    return { createdCount: created.length, codes: created };
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    session.endSession();
    throw err;
  }
}

/* Exported API */
module.exports = {
  generateEPINs,
  findEPIN,
  listEPINs,
  assignEPINToUser,
  transferEPIN,
  validateEPIN,
  activateEPIN,
  bulkImport
};
