// controllers/adminController.js
import User from "../models/User.js";
import Order from "../models/Order.js";
import Franchise from "../models/Franchise.js";
import PVLedger from "../models/PVLedger.js";
import BVLedger from "../models/BVLedger.js";
import Binary from "../models/Binary.js";
import SessionModel from "../models/Session.js";
import { success, fail } from "../utils/response.js";

/**
 * Admin endpoints (read-heavy):
 * - GET /api/admin/users
 * - GET /api/admin/orders
 * - GET /api/admin/franchises
 * - GET /api/admin/ledgers/pv
 * - GET /api/admin/ledgers/bv
 * - GET /api/admin/pairs (filter)
 * - GET /api/admin/sessions (today)
 */

export async function usersList(req, res) {
  try {
    const { limit = 100, skip = 0 } = req.query;
    const users = await User.find({}).sort({ createdAt: -1 }).skip(Number(skip)).limit(Number(limit)).lean();
    return success(res, "Users list", users);
  } catch (e) {
    console.error("usersList", e);
    return fail(res, "Server error");
  }
}

export async function ordersList(req, res) {
  try {
    const { limit = 100, skip = 0 } = req.query;
    const orders = await Order.find({}).sort({ createdAt: -1 }).skip(Number(skip)).limit(Number(limit)).lean();
    return success(res, "Orders list", orders);
  } catch (e) {
    console.error("ordersList", e);
    return fail(res, "Server error");
  }
}

export async function franchisesList(req, res) {
  try {
    const { limit = 100, skip = 0 } = req.query;
    const fr = await Franchise.find({}).sort({ createdAt: -1 }).skip(Number(skip)).limit(Number(limit)).lean();
    return success(res, "Franchises list", fr);
  } catch (e) {
    console.error("franchisesList", e);
    return fail(res, "Server error");
  }
}

export async function pvLedgerList(req, res) {
  try {
    const { userId, limit = 100, skip = 0 } = req.query;
    const q = {};
    if (userId) q.userId = userId;
    const docs = await PVLedger.find(q).sort({ createdAt: -1 }).skip(Number(skip)).limit(Number(limit)).lean();
    return success(res, "PV ledger", docs);
  } catch (e) {
    console.error("pvLedgerList", e);
    return fail(res, "Server error");
  }
}

export async function bvLedgerList(req, res) {
  try {
    const { userId, limit = 100, skip = 0 } = req.query;
    const q = {};
    if (userId) q.userId = userId;
    const docs = await BVLedger.find(q).sort({ createdAt: -1 }).skip(Number(skip)).limit(Number(limit)).lean();
    return success(res, "BV ledger", docs);
  } catch (e) {
    console.error("bvLedgerList", e);
    return fail(res, "Server error");
  }
}

export async function pairsList(req, res) {
  try {
    const { status, packageType, limit = 200 } = req.query;
    const q = {};
    if (status) q.status = status;
    if (packageType) q.packageType = packageType;
    const docs = await Binary.find(q).sort({ createdAt: -1 }).limit(Number(limit)).lean();
    return success(res, "Pairs", docs);
  } catch (e) {
    console.error("pairsList", e);
    return fail(res, "Server error");
  }
}

export async function sessionsList(req, res) {
  try {
    const { date } = req.query;
    const q = {};
    if (date) q.date = date;
    const docs = await SessionModel.find(q).sort({ sessionNumber: 1 }).lean();
    return success(res, "Sessions", docs);
  } catch (e) {
    console.error("sessionsList", e);
    return fail(res, "Server error");
  }
}
