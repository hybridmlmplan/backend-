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
// PlacementId OPTIONAL
// Email MULTIPLE accounts allowed
// Phone UNIQUE
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

    // 1) VALIDATIONS
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

    // 2) CHECK UNIQUE PHONE (email allowed multiple)
    const phoneExists = await User.findOne({ phone });
    if (phoneExists) {
      return res.status(400).json({
        status: false,
        message: "Phone already registered",
      });
    }

    // 3) HASH PASSWORD
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    // 4) GENERATE USER ID
    const userId = await generateUserId();

    // 5) CREATE NEW USER
    const user = await User.create({
      userId,
      name,
      phone,
      email: email || null,
      password: hashedPassword,

      sponsorId,                     // REQUIRED
      placementId: placementId || null, // OPTIONAL
      placementSide: placementSide || null, // OPTIONAL

      packageType: packageType || "silver",

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
