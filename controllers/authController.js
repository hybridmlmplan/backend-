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
      status: "inactive", // Activate only after registration
      currentPackage: "none",
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
      userId: user.userId,
      currentPackage: user.currentPackage,
      status: user.status,
    });
  } catch (err) {
    return res.status(500).json({ message: "Login failed", error: err });
  }
};
