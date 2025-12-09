// controllers/packageController.js
import mongoose from 'mongoose';
import PackageModel from '../models/Package.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import EPIN from '../models/EPIN.js';
import PVLedger from '../models/PVLedger.js';
import BVLedger from '../models/BVLedger.js';
import WalletLedger from '../models/WalletLedger.js';
import Franchise from '../models/Franchise.js';
import { generateFranchiseCode, generateUserCode } from '../utils/idGenerator.js';
import { autoPlacementIfMissing } from '../utils/placement.js';
import { success, fail } from '../utils/response.js';

// Helper: build order totals from items
function computeOrderTotals(items = []) {
  let totalPrice = 0, totalBV = 0, totalPV = 0;
  for (const it of items) {
    totalPrice += (it.price || 0) * (it.qty || 1);
    totalBV += (it.bv || 0) * (it.qty || 1);
    totalPV += (it.pv || 0) * (it.qty || 1);
  }
  return { totalPrice, totalBV, totalPV };
}

// Admin: create/update packages
export async function upsertPackage(req, res) {
  try {
    const { code, name, price, pv, pairIncome, sessionCapPerSession } = req.body;
    if (!code || !name || !price || !pv || !pairIncome) return fail(res, 'Missing package fields');

    const pkg = await PackageModel.findOneAndUpdate(
      { code },
      { name, price, pv, pairIncome, sessionCapPerSession: sessionCapPerSession || 1 },
      { upsert: true, new: true }
    );
    return success(res, 'Package upserted', pkg);
  } catch (e) {
    console.error('upsertPackage', e);
    return fail(res, 'Server error');
  }
}

export async function listPackages(req, res) {
  try {
    const pkgs = await PackageModel.find().sort({ code: 1 });
    return success(res, 'Packages fetched', pkgs);
  } catch (e) {
    console.error('listPackages', e);
    return fail(res, 'Server error');
  }
}

// User purchasing package via EPIN or direct order
// body: { userCode, items:[{productId,name,qty,price,bv,pv}], epinCode (optional), franchiseId (optional) }
export async function purchasePackage(req, res) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { userCode, items = [], epinCode = null, franchiseId = null } = req.body;
    if (!userCode) { await session.abortTransaction(); return fail(res, 'userCode required'); }

    const user = await User.findOne({ userCode }).session(session);
    if (!user
