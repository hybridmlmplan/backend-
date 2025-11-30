import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// =========================
// SIGNUP (BASIC ACCOUNT)
// =========================
export const signup = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password)
      return res.status(400).json({ message: "All fields required" });

    if (password.length < 6)
      return res.status(400).json({ message: "Password must be 6+ characters" });

    const userExist = await User.findOne({
      $or: [{ email }, { phone }],
    });

    if (userExist)
      return res.status(400).json({ message: "Email or Phone already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name,
      email,
      phone,
      password: hashedPassword,
      status: "inactive",
      currentPackage: "none",
      isRegistered: false,
      kycStatus: "Not Submitted",
    });

    return res.json({
      status: true,
      message: "Signup successful",
      userId: newUser._id,
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
// LOGIN (PASSWORD BASED)
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
      userId: user._id,
      currentPackage: user.currentPackage,
      status: user.status,
      isRegistered: user.isRegistered,
    });

  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Login failed",
      error: err.message,
    });
  }
};

// =======================================
// FULL REGISTRATION (KYC)
// =======================================
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

    // ❗ 29 February — NO REGISTRATION
    const today = new Date();
    if (today.getDate() === 29 && today.getMonth() === 1) {
      return res.status(403).json({
        status: false,
        message: "29 February ko registration allowed nahi hai."
      });
    }

    if (!userId || !fullName || !phone || !aadhar || !pan) {
      return res.status(400).json({
        status: false,
        message: "Required fields missing"
      });
    }

    const user = await User.findById(userId);
    if (!user)
      return res.status(404).json({ status: false, message: "User not found" });

    if (user.isRegistered) {
      return res.status(400).json({
        status: false,
        message: "Registration already completed"
      });
    }

    // SAVE KYC DETAILS
    user.fullName = fullName;

    // phone cannot be changed after signup → GT70 rule
    // user.phone = phone; 

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

    user.isRegistered = true;
    user.kycStatus = "Pending";

    await user.save();

    return res.status(200).json({
      status: true,
      message: "Registration completed — KYC Pending",
      data: {
        userId: user._id,
        fullName: user.fullName,
        phone: user.phone,
        kycStatus: user.kycStatus,
      }
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: error.message
    });
  }
};
