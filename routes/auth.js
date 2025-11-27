const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// LOGIN API
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check empty fields
    if (!email || !password) {
      return res.status(400).json({ message: "Email & Password required" });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check password match
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid Password" });
    }

    // Create login token
    const token = jwt.sign({ id: user._id }, "SECRETKEY", {
      expiresIn: "7d",
    });

    res.json({
      message: "Login Success",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

module.exports = router;
const bcrypt = require("bcryptjs");

// SIGNUP API
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check empty fields
    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    // Check if user already exists
    const exist = await User.findOne({ email });
    if (exist) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Hash password
    const hashedPass = await bcrypt.hash(password, 10);

    // Create new user
    const user = await User.create({
      name,
      email,
      password: hashedPass,
    });

    res.json({ message: "Signup Success", user });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});
