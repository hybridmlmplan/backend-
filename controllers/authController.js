import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// =========================
// SIGNUP (ONLY BASIC ACCOUNT)
// =========================
export const signup = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password)
      return res.status(400).json({ message: "All fields required" });

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

    return res.json({ message: "Signup successful", userId: newUser._id });
  } catch (err) {
    return res.status(500).json({ message: "Signup failed", error: err });
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
      process.env.JWT_SECRET || "mlmsecret",
      { expiresIn: "7d" }
    );

    return res.json({
      message: "Login successful",
      token,
      name: user.name,
      userId: user._id,
      currentPackage: user.currentPackage,
      status: user.status,
    });
  } catch (err) {
    return res.status(500).json({ message: "Login failed", error: err });
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

    // Validate fields
    if (!userId || !fullName || !phone || !aadhar || !pan) {
      return res.status(400).json({
        status: false,
        message: "Required fields missing"
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found"
      });
    }

    // Already registered?
    if (user.isRegistered) {
      return res.status(400).json({
        status: false,
        message: "Registration already completed"
      });
    }

    // Save KYC
    user.fullName = fullName;
    user.phone = phone;
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
      data: user
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: error.message
    });
  }
};
