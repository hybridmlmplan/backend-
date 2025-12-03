import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// =========================
// GENERATE USER ID
// =========================
async function generateUserId(packageName) {
  const prefix =
    packageName === "silver"
      ? "SP"
      : packageName === "gold"
      ? "GP"
      : "RP";

  const count = await User.countDocuments({ currentPackage: packageName });
  const number = 1001 + count;
  return `${prefix}${number}`;
}

// =========================
// SIGNUP (FULL ACCOUNT)
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
      package: packageName,
    } = req.body;

    // Basic validation
    if (!name || !email || !phone || !password)
      return res.status(400).json({ status: false, message: "All fields required" });

    // Check duplicates
    const userExist = await User.findOne({
      $or: [{ email }, { phone }],
    });

    if (userExist)
      return res.status(400).json({
        status: false,
        message: "Email or Phone already exists",
      });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate MLM userId
    const userId = await generateUserId(packageName || "silver");

    // Default session
    const session = new Date().getHours() < 16 ? 1 : 2;

    // Create user
    const newUser = await User.create({
// Default safe values
const safeSponsor = sponsorId || "SP1001";
const safePlacement = placementId || "SP1001";
const safePosition = position || "left";

// Create user
const newUser = await User.create({
  userId,
  name,
  email,
  phone,
  password: hashedPassword,

  // MLM
  sponsorId: safeSponsor,
  referralId: safeSponsor,
  treeParent: safePlacement,
  placementSide: safePosition,

  // Package
  currentPackage: packageName,
  joinedDate: new Date(),
  session,
  status: "inactive",

  // Renewal
  renewalDate: new Date(),

  // KYC
  kycStatus: "not-submitted",
});


    return res.status(200).json({
      status: true,
      message: "Signup successful",
      userId: newUser.userId, // SP1001
      package: newUser.currentPackage,
      position: newUser.placementSide,
    });

  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Signup failed",
      error: err.message,
    });
  }
};

// =========================
// LOGIN
// =========================
export const login = async (req, res) => {
  try {
    const { emailOrPhone, password } = req.body;

    if (!emailOrPhone || !password)
      return res.status(400).json({ message: "All fields required" });

    const user = await User.findOne({
      $or: [{ email: emailOrPhone }, { phone: emailOrPhone }],
    });

    if (!user)
      return res.status(400).json({ message: "User not found" });

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch)
      return res.status(400).json({ message: "Incorrect password" });

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      status: true,
      message: "Login successful",
      token,
      name: user.name,
      userId: user.userId,
      currentPackage: user.currentPackage,
      status: user.status,
      kycStatus: user.kycStatus,
    });

  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Login failed",
      error: err.message,
    });
  }
};

// =========================
// KYC
// =========================
export const registerUser = async (req, res) => {
  try {
    const {
      userId,
      fullName,
      phone,
      aadhar,
      pan,
      address,
      dob,
      nomineeName,
      nomineeRelation,
      bankName,
      accountNumber,
      ifsc,
      upiId
    } = req.body;

    const user = await User.findOne({ userId });
    if (!user)
      return res.status(400).json({ status: false, message: "User not found" });

    if (user.kycStatus !== "not-submitted")
      return res.status(400).json({
        status: false,
        message: "Registration already completed"
      });

    // Save details
    user.fullName = fullName;
    user.aadhar = aadhar;
    user.pan = pan;
    user.address = address;
    user.dob = dob;

    user.nominee = {
      name: nomineeName,
      relation: nomineeRelation,
    };

    user.bankDetails = {
      bankName,
      accountNumber,
      ifsc,
      upiId
    };

    user.kycStatus = "pending";
    await user.save();

    return res.status(200).json({
      status: true,
      message: "Registration completed — KYC Pending",
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: error.message
    });
  }
};
