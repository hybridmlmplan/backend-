import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

/**
 * Helpers
 */
const padNumber = (num, len = 4) => String(num).padStart(len, "0");

const getIndiaSession = () => {
  // Determine session based on India time (Asia/Kolkata)
  // Session 1: 06:00 - 16:00 (inclusive)
  // Session 2: otherwise (16:01 - 05:59)
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000; // +5:30
  const ist = new Date(now.getTime() + istOffsetMs);
  const hour = ist.getHours();
  // use 6..16 inclusive as session 1
  return hour >= 6 && hour <= 16 ? 1 : 2;
};

const packageToPv = (pkg) => {
  if (!pkg) return 0;
  const p = String(pkg).toLowerCase();
  if (p === "silver") return 35;
  if (p === "gold") return 155;
  if (p === "ruby") return 1250;
  return 0;
};

const generateUserId = async () => {
  // Uses GSM + 4 digits => GSM0001, GSM0002, ...
  const last = await User.find().sort({ createdAt: -1 }).limit(1);
  if (!last || last.length === 0) {
    return "GSM0001";
  }
  const lastId = last[0].userId || "";
  const numericPart = parseInt((lastId.replace(/^GSM/i, "") || "0"), 10);
  const next = isNaN(numericPart) ? 1 : numericPart + 1;
  return "GSM" + padNumber(next, 4);
};

/**
 * SIGNUP
 */
export const signup = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      sponsorId: rawSponsor,
      placementId: rawPlacement,
      position, // expected "left" | "right"
      packageName: rawPackage,
    } = req.body || {};

    // Basic validation
    if (!name || !phone || !password) {
      return res.status(400).json({
        status: false,
        message: "Missing required fields: name, phone, and password are required.",
      });
    }

    // Normalize inputs
    const safePackage = rawPackage || "Silver";
    const safeSponsor = rawSponsor || "GSM0001";
    const safePlacement = rawPlacement || safeSponsor; // default placement = sponsor
    const safePosition = (position === "right") ? "right" : "left"; // default left

    // Check duplicates
    if (email) {
      const e = await User.findOne({ email });
      if (e) {
        return res.status(400).json({ status: false, message: "Email already registered." });
      }
    }
    const p = await User.findOne({ phone });
    if (p) {
      return res.status(400).json({ status: false, message: "Phone already registered." });
    }

    // Verify sponsor & placement exist (use fallback GSM0001)
    const sponsor = await User.findOne({ userId: safeSponsor });
    if (!sponsor && safeSponsor !== "GSM0001") {
      return res.status(400).json({ status: false, message: "Invalid sponsorId provided." });
    }
    const placement = await User.findOne({ userId: safePlacement });
    if (!placement && safePlacement !== "GSM0001") {
      return res.status(400).json({ status: false, message: "Invalid placementId provided." });
    }

    // Generate userId
    const userId = await generateUserId();

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    // Package PV mapping
    const pv = packageToPv(safePackage);

    // session & dates
    const session = getIndiaSession();
    const now = new Date();

    // Prepare packageHistory entry
    const packageHistoryEntry = {
      packageName: safePackage,
      amount: 0, // keep 0 if amount not provided; update on payment flow
      pv,
      activationDate: now,
    };

    // Wallet defaults (keep consistent with your model)
    const wallet = {
      pairIncome: 0,
      levelIncome: 0,
      royaltyIncome: 0,
      percentageIncome: 0,
      fundIncome: 0,
    };

    // Create user document ready for insertion (fields mapped to your model)
    const newUserDoc = {
      userId,
      name,
      email: email || undefined,
      phone,
      password: hashed,
      upiId: req.body.upiId || undefined,

      // sponsor / referral / placement fields
      sponsorId: sponsor ? sponsor.userId : (safeSponsor === "GSM0001" ? "GSM0001" : safeSponsor),
      referralId: undefined, // set after create to user's own id
      placementSide: safePosition, // matches model field name

      // joining / session / status
      joinedDate: now,
      session,
      status: "active",

      // package
      currentPackage: safePackage,
      packageHistory: [packageHistoryEntry],

      // PV / BV
      pv,
      bv: 0,
      leftPV: 0,
      rightPV: 0,
      leftCarry: 0,
      rightCarry: 0,

      // level / rank
      directCount: 0,
      level: "None",
      rank: "None",

      // wallet
      wallet,

      // genealogy
      treeParent: placement ? placement.userId : (safePlacement === "GSM0001" ? "GSM0001" : safePlacement),
      treeChildren: [],

      // renewal / extras
      renewalDate: now,
      extraPV: 0,

      // kyc
      kycStatus: "not-submitted",

      // nominee / address / documents (kept undefined unless provided)
      nominee: req.body.nominee || undefined,
      address: req.body.address || undefined,
      documents: req.body.documents || undefined,
    };

    // Insert user
    const created = await User.create(newUserDoc);

    // Now set referralId = created.userId (self reference)
    created.referralId = created.userId;
    await created.save();

    // Optionally: update sponsor's directCount or children arrays (non-invasive)
    // We'll perform minimal safe updates here so as not to break any heavy logic:
    if (sponsor) {
      await User.updateOne(
        { userId: sponsor.userId },
        { $inc: { directCount: 1 }, $push: { treeChildren: { userId: created.userId, placementSide: safePosition, joinedDate: now } } }
      );
    } else if (safeSponsor === "GSM0001") {
      // If sponsor is default root and root exists, add child to root if present
      const root = await User.findOne({ userId: "GSM0001" });
      if (root) {
        await User.updateOne(
          { userId: "GSM0001" },
          { $inc: { directCount: 1 }, $push: { treeChildren: { userId: created.userId, placementSide: safePosition, joinedDate: now } } }
        );
      }
    }

    // Successful response
    return res.status(201).json({
      status: true,
      message: "Signup successful",
      userId: created.userId,
      session: created.session,
    });
  } catch (err) {
    console.error("Signup error:", err);
    // If mongoose validation errors occur, forward clear message
    if (err.name === "ValidationError") {
      return res.status(400).json({ status: false, message: "Validation error", error: err.message });
    }
    return res.status(500).json({ status: false, message: "Signup failed", error: err.message });
  }
};

/**
 * LOGIN
 */
export const login = async (req, res) => {
  try {
    const { email, phone, password } = req.body || {};

    if (!password || (!email && !phone)) {
      return res.status(400).json({
        status: false,
        message: "Provide password and (email or phone) to login",
      });
    }

    // Find by email or phone
    const user = email ? await User.findOne({ email }) : await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ status: false, message: "Invalid password" });
    }

    const token = jwt.sign(
      { id: user._id, userId: user.userId },
      process.env.JWT_SECRET || "secret",
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      status: true,
      message: "Login successful",
      token,
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        currentPackage: user.currentPackage,
        session: user.session,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ status: false, message: "Login failed", error: err.message });
  }
};
      
