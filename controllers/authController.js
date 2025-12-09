// controllers/authController.js
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../models/User.js';
import EPIN from '../models/EPIN.js';
import Franchise from '../models/Franchise.js';
import PVLedger from '../models/PVLedger.js';
import BVLedger from '../models/BVLedger.js';
import Order from '../models/Order.js';
import { generateUserCode, generateFranchiseCode } from '../utils/idGenerator.js';
import { autoPlacementIfMissing } from '../utils/placement.js';
import { signToken } from '../utils/auth.js';
import { success, fail } from '../utils/response.js';
import config from '../config/env.js'; // optional env helper

// Helper: create wallet-like ledger entry on signup activation
async function creditPVAndLedger(session, userId, packageType, amount, source = 'activation', refId = null) {
  // update user pv balance and create pv ledger entry
  const user = await User.findById(userId).session(session);
  if (!user) throw new Error('User not found for PV credit');

  // increment PV for the package
  user.pvBalance = user.pvBalance || { silver:0, gold:0, ruby:0 };
  user.pvBalance[packageType] = (user.pvBalance[packageType] || 0) + amount;
  await user.save({ session });

  // create PV ledger
  await PVLedger.create([{
    userId,
    type: 'credit',
    packageType,
    amount,
    balanceAfter: user.pvBalance[packageType],
    source,
    refId
  }], { session });
}

// =========================
// SIGNUP
// =========================
export async function signup(req, res) {
  const session = await mongoose.startSession();
  try {
    const { name, phone, email, password, sponsorId, placementId, placementSide, package: pkg, epin } = req.body;

    if (!name || !phone || !password || !sponsorId) {
      return fail(res, 'Missing required fields: name
