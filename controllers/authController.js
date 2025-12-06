import User from "../models/User.js";
import bcrypt from "bcryptjs";

// =======================================
// Helper: Generate Unique UserID (GSM0001)
// =======================================
const generateUserId = async () => {
  const lastUser = await User.findOne().sort({ createdAt: -1 });

  if (!lastUser) return "GSM0001";

  const lastId = lastUser.userId || "GSM0000";
  const num = parseInt(lastId.replace("GSM", "")) + 1;

  return "GSM" + num.toString().padStart(4, "0");
};

// ======================================================
// SIGNUP CONTROLLER
// Sponsor REQUIRED
// Placement OPTIONAL
// Phone UNIQUE
// Email MULTIPLE allowed
// ======================================================
export const signup = async (req, res) => {
  try {
    const {
      name,
      phone,
      password,
      sponsorId,
      placementId,
      placementSide,
      packageType,
      email,
    } = req.body;

    // 1) REQUIRED VALIDATION
    if (!name || !phone || !password) {
      return res.status(400).json({
        status: false,
        message: "Name, phone & password are required",
      });
    }

    if (!sponsorId) {
      return res.status(400).json({
        status: false,
        message: "Sponsor ID is required",
      });
    }

    // 2) CHECK UNIQUE PHONE
    const phoneExists = await User.findOne({ phone });
    if (phoneExists) {
      return res.status(400).json({
        status: false,
        message: "Phone already registered",
      });
    }

    // 3) VALID SPONSOR CHECK
    const sponsor = await User.findOne({ userId: sponsorId });
    if (!sponsor) {
      return res.status(400).json({
        status: false,
        message: "Invalid sponsor ID",
      });
    }

    // 4) VALID PLACEMENT CHECK (if provided)
    let validPlacement = null;
    if (placementId) {
      validPlacement = await User.findOne({ userId: placementId });
      if (!validPlacement) {
        return res.status(400).json({
          status: false,
          message: "Invalid placement ID",
        });
      }
    }

    // 5) HASH PASSWORD
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    // 6) GENERATE USER ID
    const userId = await generateUserId();

    // 7) PACKAGE NORMALIZATION
    const finalPackage =
      (packageType || "silver").toString().trim().toLowerCase();

    // 8) CREATE USER
    const user = await User.create({
      userId,
      name,
      phone,
      email: email || null,
      password: hashedPassword,

      sponsorId,
      placementId: placementId || null,
      placementSide: placementSide || null,

      packageType: finalPackage,

      session: 1,
      joinedDate: new Date(),
      renewalDate: new Date(),

      status: "inactive",

      pv: 0,
      bv: 0,
    });

    return res.status(201).json({
      status: true,
      message: "Signup successful",
      userId: user.userId,
      loginPhone: user.phone,
    });

  } catch (error) {
    console.log("Signup error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error during signup",
    });
  }
};

// =======================================
// LOGIN CONTROLLER (Phone + Password)
// =======================================
export const login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        status: false,
        message: "Phone and password are required",
      });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({
        status: false,
        message: "User not found",
      });
    }

    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        status: false,
        message: "Invalid credentials",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Login successful",
      userId: user.userId,
    });

  } catch (error) {
    console.log("Login error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error during login",
    });
  }
};
