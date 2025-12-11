/**
 * controllers/authController.js
 *
 * Auth controller for Hybrid MLM Plan (Dev ji)
 * - Signup with auto-generated userId starting GSM0001, GSM0002, ...
 * - Login (JWT)
 * - Get profile
 * - Change password
 * - Optional: accept epin on signup (if provided)
 * - Placement & sponsor validation (placement optional; auto-placement BFS left-first)
 *
 * Assumptions:
 * - Mongoose models exist: User, EPin, Package, Order (adjust import paths if needed)
 * - User schema contains fields used below: userId, name, email, phone, password, sponsorId,
 *   placementId, placementSide, packages (array), leftChild, rightChild, createdAt, isAdmin
 * - JWT secret: process.env.JWT_SECRET
 * - JWT expiry: process.env.JWT_EXPIRES_IN (default "7d")
 * - SALT_ROUNDS: process.env.SALT_ROUNDS (default 10)
 *
 * Important business rules implemented here:
 * - Email duplicates ARE ALLOWED (unlimited accounts per email)
 * - Phone number is UNIQUE by default (to avoid accidental duplicates). If you want phone unlimited,
 *   remove the phone-unique check below.
 * - User IDs generated with GSM prefix (GSM0001, GSM0002, ...)
 * - New users created with empty packages array (non-active). Package activation must be done via order/activation flow.
 *
 * Notes:
 * - For heavy concurrent signup load, replace the simple generateNextUserId with an atomic counter collection.
 * - This controller does not implement email verification or SMS OTP by default (can be added).
 *
 * Author: ChatGPT (master mode) for Dev ji
 * Date: 2025-12-11
 */

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

// Adjust these imports to your project paths
import User from "../models/User.js";
import EPin from "../models/EPin.js";
import PackageModel from "../models/Package.js";
import Order from "../models/Order.js";

const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS || "10", 10);

const authController = {};

/* -------------------------
   Helper: Generate next userId
   Format: GSM0001, GSM0002, ...
   NOTE: For very high concurrency, replace with atomic counter collection.
------------------------- */
async function generateNextUserId(prefix = "GSM") {
  // Find latest userId with prefix sorted by createdAt desc and userId desc
  const regex = new RegExp(`^${prefix}(\\d+)$`, "i");
  const latest = await User.find({ userId: { $regex: regex } })
    .sort({ createdAt: -1, userId: -1 })
    .limit(1)
    .select("userId")
    .lean();

  if (!latest || latest.length === 0) {
    return `${prefix}0001`;
  }

  const lastId = latest[0].userId;
  const numPart = parseInt(lastId.replace(prefix, ""), 10) || 0;
  const nextNum = numPart + 1;
  const padded = String(nextNum).padStart(4, "0");
  return `${prefix}${padded}`;
}

/* -------------------------
   Helper: Validate sponsorId
   sponsorId can be "ROOT" or an existing userId
------------------------- */
async function validateSponsor(sponsorId) {
  if (!sponsorId) return { ok: false, message: "sponsorId required" };
  if (String(sponsorId).toUpperCase() === "ROOT") {
    return { ok: true, sponsorUser: null, sponsorIsRoot: true };
  }
  const sponsorUser = await User.findOne({ userId: sponsorId }).lean();
  if (!sponsorUser) return { ok: false, message: "Sponsor not found" };
  return { ok: true, sponsorUser, sponsorIsRoot: false };
}

/* -------------------------
   Helper: Auto-placement under sponsor (left-first BFS)
   Returns { placementId, placementSide }
   Assumes User schema has leftChild, rightChild, userId fields.
------------------------- */
async function findAutoPlacementUnderSponsor(sponsorUserId) {
  if (!sponsorUserId || String(sponsorUserId).toUpperCase() === "ROOT") {
    return { placementId: null, placementSide: null }; // top-level
  }

  const sponsor = await User.findOne({ userId: sponsorUserId }).select("userId leftChild rightChild").lean();
  if (!sponsor) return { placementId: sponsorUserId, placementSide: "L" };

  if (!sponsor.leftChild) return { placementId: sponsor.userId, placementSide: "L" };
  if (!sponsor.rightChild) return { placementId: sponsor.userId, placementSide: "R" };

  // BFS queue
  const queue = [sponsor.userId];
  while (queue.length) {
    const currentUserId = queue.shift();
    const current = await User.findOne({ userId: currentUserId }).select("userId leftChild rightChild").lean();
    if (!current) continue;
    if (!current.leftChild) return { placementId: current.userId, placementSide: "L" };
    if (!current.rightChild) return { placementId: current.userId, placementSide: "R" };
    queue.push(current.leftChild);
    queue.push(current.rightChild);
  }

  // fallback
  return { placementId: sponsorUserId, placementSide: "L" };
}

/* -------------------------
   Helper: Attach new child to parent (update parent's leftChild/rightChild)
------------------------- */
async function attachToPlacement(parentUserId, childUserId, side = "L") {
  if (!parentUserId || !childUserId) return;
  const update = {};
  if (side === "L") update.leftChild = childUserId;
  else update.rightChild = childUserId;
  await User.updateOne({ userId: parentUserId }, { $set: update }).exec();
}

/* -------------------------
   Signup
   POST /auth/signup
   Body: { name, phone, password, sponsorId, placementId (optional), placementSide (optional), email (optional), epin (optional) }
   - Email duplicates ALLOWED
   - Phone UNIQUE (change if you want phone unlimited)
------------------------- */
authController.signup = async (req, res) => {
  try {
    const {
      name,
      phone,
      password,
      sponsorId,
      placementId: providedPlacementId,
      placementSide: providedPlacementSide,
      email,
      epin: providedEpin,
    } = req.body;

    if (!name || !phone || !password || !sponsorId) {
      return res.status(400).json({ status: false, message: "name, phone, password and sponsorId are required" });
    }

    // Validate sponsor
    const sponsorValidation = await validateSponsor(sponsorId);
    if (!sponsorValidation.ok) {
      return res.status(400).json({ status: false, message: sponsorValidation.message });
    }

    // Phone uniqueness check (keep; change if you want phone unlimited)
    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({ status: false, message: "Phone number already registered" });
    }

    // Generate userId with GSM prefix
    const userId = await generateNextUserId("GSM");

    // Hash password
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hashedPassword = await bcrypt.hash(password, salt);

    // EPIN validation (optional)
    let epinDoc = null;
    if (providedEpin) {
      epinDoc = await EPin.findOne({ code: providedEpin });
      if (!epinDoc) {
        return res.status(400).json({ status: false, message: "Invalid EPIN provided" });
      }
      if (epinDoc.used) {
        return res.status(400).json({ status: false, message: "EPIN already used" });
      }
    }

    // Determine placement (use provided or auto)
    let finalPlacementId = providedPlacementId || null;
    let finalPlacementSide = providedPlacementSide || null;

    if (!finalPlacementId) {
      const sponsorUserId = String(sponsorId).toUpperCase() === "ROOT" ? null : sponsorId;
      const autoPlacement = await findAutoPlacementUnderSponsor(sponsorUserId);
      finalPlacementId = autoPlacement.placementId;
      finalPlacementSide = autoPlacement.placementSide;
    }

    // Create new user (packages empty => non-active packages)
    const userDoc = new User({
      userId,
      name,
      email: email || null, // email duplicates allowed
      phone,
      password: hashedPassword,
      sponsorId,
      placementId: finalPlacementId || null,
      placementSide: finalPlacementSide || null,
      packages: [], // no active packages at signup
      leftChild: null,
      rightChild: null,
      createdAt: new Date(),
      isAdmin: false,
    });

    await userDoc.save();

    // Attach to placement parent node if applicable
    if (finalPlacementId) {
      try {
        await attachToPlacement(finalPlacementId, userDoc.userId, finalPlacementSide || "L");
      } catch (err) {
        console.warn("attachToPlacement error (non-fatal):", err.message);
      }
    }

    // Reserve EPIN if provided (do not mark used until activation flow)
    if (epinDoc) {
      epinDoc.reservedBy = userDoc._id;
      epinDoc.reservedAt = new Date();
      await epinDoc.save();
    }

    return res.status(201).json({
      status: true,
      message: "User registered successfully",
      data: {
        userId: userDoc.userId,
        name: userDoc.name,
        phone: userDoc.phone,
        email: userDoc.email,
        sponsorId: userDoc.sponsorId,
        placementId: userDoc.placementId,
        placementSide: userDoc.placementSide,
      },
    });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ status: false, message: "Server error during signup", error: err.message });
  }
};

/* -------------------------
   Login
   POST /auth/login
   Body: { userIdOrPhoneOrEmail, password }
------------------------- */
authController.login = async (req, res) => {
  try {
    const { userIdOrPhoneOrEmail, password } = req.body;
    if (!userIdOrPhoneOrEmail || !password) {
      return res.status(400).json({ status: false, message: "Credentials required" });
    }

    // Find by userId, phone or email
    const user = await User.findOne({
      $or: [{ userId: userIdOrPhoneOrEmail }, { phone: userIdOrPhoneOrEmail }, { email: userIdOrPhoneOrEmail }],
    });

    if (!user) {
      return res.status(401).json({ status: false, message: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ status: false, message: "Invalid credentials" });
    }

    const payload = { id: user._id, userId: user.userId, isAdmin: user.isAdmin || false };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return res.status(200).json({
      status: true,
      message: "Login successful",
      data: {
        token,
        user: {
          userId: user.userId,
          name: user.name,
          email: user.email,
          phone: user.phone,
          sponsorId: user.sponsorId,
          placementId: user.placementId,
          packages: user.packages || [],
        },
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ status: false, message: "Server error during login", error: err.message });
  }
};

/* -------------------------
   Get Profile (protected)
   GET /auth/profile
   Requires auth middleware that sets req.user = { id: user._id, ... }
------------------------- */
authController.getProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ status: false, message: "Unauthorized" });

    const user = await User.findById(userId).select("-password -__v").lean();
    if (!user) return res.status(404).json({ status: false, message: "User not found" });

    return res.status(200).json({ status: true, data: user });
  } catch (err) {
    console.error("Get profile error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};

/* -------------------------
   Change Password (protected)
   POST /auth/change-password
   Body: { oldPassword, newPassword }
------------------------- */
authController.changePassword = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { oldPassword, newPassword } = req.body;
    if (!userId) return res.status(401).json({ status: false, message: "Unauthorized" });
    if (!oldPassword || !newPassword) return res.status(400).json({ status: false, message: "Both passwords required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ status: false, message: "User not found" });

    const match = await bcrypt.compare(oldPassword, user.password);
    if (!match) return res.status(400).json({ status: false, message: "Old password incorrect" });

    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    return res.status(200).json({ status: true, message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};

export default authController;
