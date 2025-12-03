import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// =========================
// SIGNUP (REGISTER)
// =========================
export const signup = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      sponsorId,
      placementId,
      position,
      packageName
    } = req.body;

    // Fallback default (IMPORTANT)
    const safeSponsor = sponsorId || "GSM001";
    const safePlacement = placementId || "GSM001";
    const safePosition = position || "left";
    const safePackage = packageName || "Silver";

    // 1) Check existing email
    const exists = await User.findOne({ email });
    if (exists)
      return res.status(400).json({
        status: false,
        message: "Email already registered"
      });

    // 2) Verify sponsor
    const sponsor = await User.findOne({ userId: safeSponsor });
    if (!sponsor)
      return res.status(400).json({
        status: false,
        message: "Invalid sponsor ID"
      });

    // 3) Verify placement
    const placement = await User.findOne({ userId: safePlacement });
    if (!placement)
      return res.status(400).json({
        status: false,
        message: "Invalid placement ID"
      });

    // 4) Generate Auto userId
    let last = await User.find().sort({ _id: -1 }).limit(1);
    let newNumber = last.length === 0
      ? 2   // because GSM001 is root
      : (parseInt(last[0].userId?.replace("GSM", "")) + 1);

    const userId = "GSM" + String(newNumber).padStart(3, "0");

    // 5) Hash password
    const hash = await bcrypt.hash(password, 10);

    // 6) Package PV
    let pv = 0;
    if (safePackage === "Silver") pv = 35;
    if (safePackage === "Gold") pv = 155;
    if (safePackage === "Ruby") pv = 1250;

    // 7) Create user
    const newUser = await User.create({
      userId,
      name,
      email,
      phone,
      password: hash,
      sponsorId: safeSponsor,
      placementId: safePlacement,
      position: safePosition,
      currentPackage: safePackage,
      pv,
      leftPv: 0,
      rightPv: 0,
      leftCount: 0,
      rightCount: 0,
      activeDate: new Date(),
      status: "active",
      kycStatus: "not-submitted"
    });

    return res.status(200).json({
      status: true,
      message: "Signup successful",
      userId: newUser.userId
    });

  } catch (err) {
    console.log("Signup error:", err);
    return res.status(500).json({
      status: false,
      message: "Signup failed",
      error: err.message
    });
  }
};

// =========================
// LOGIN
// =========================
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check user
    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({
        status: false,
        message: "User not found"
      });

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({
        status: false,
        message: "Invalid password"
      });

    // Create token
    const token = jwt.sign(
      { id: user._id, userId: user.userId },
      process.env.JWT_SECRET || "secret",
      { expiresIn: "7d" }
    );

    res.status(200).json({
      status: true,
      message: "Login successful",
      token,
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Login failed",
      error: error.message
    });
  }
};
