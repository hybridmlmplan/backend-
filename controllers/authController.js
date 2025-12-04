import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// =======================================
// Helper: Generate Unique UserID (GSM0001)
// =======================================
const generateUserId = async () => {
  const lastUser = await User.find().sort({ createdAt: -1 }).limit(1);

  if (!lastUser || lastUser.length === 0) {
    return "GSM0001";
  }

  const lastId = lastUser[0].userId;
  const num = parseInt(lastId.replace("GSM", "")) + 1;

  return "GSM" + num.toString().padStart(4, "0");
};

// ======================================================
// SIGNUP CONTROLLER (Sponsor Required, Placement Optional)
// ======================================================
export const signup = async (req, res) => {
  try {
    const { name, phone, password, sponsorId, placementSide } = req.body;

    // -------------------------------------------------
    // VALIDATIONS
    // -------------------------------------------------
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

    // -------------------------------------------------
    // CHECK DUPLICATE PHONE
    // -------------------------------------------------
    const phoneExists = await User.findOne({ phone });
    if (phoneExists) {
      return res.status(400).json({
        status: false,
        message: "Phone already registered.",
      });
    }

    // -------------------------------------------------
    // HASH PASSWORD
    // -------------------------------------------------
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    // -------------------------------------------------
    // GENERATE USER ID
    // -------------------------------------------------
    const userId = await generateUserId();

    // -------------------------------------------------
    // CREATE USER
    // -------------------------------------------------
    const user = new User({
      userId,
      name,
      phone,
      password: hashedPassword,
      sponsorId,
      placementSide: placementSide || null, // OPTIONAL

      // required fields
      session: 1,
      joinedDate: new Date(),
      renewalDate: new Date(),

      // defaults
      status: "inactive",
      currentPackage: "none",
      pv: 0,
      bv: 0,
    });

    await user.save();

    return res.status(200).json({
      status: true,
      message: "Signup successful",
      userId: user.userId,
      session: user.session,
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
