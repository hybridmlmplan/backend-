const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// SIGNUP
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: "All fields required" });

    const exist = await User.findOne({ email });
    if (exist) return res.status(400).json({ message: "Email already registered" });

    const hashedPass = await bcrypt.hash(password, 10);

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

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid Password" });

    const token = jwt.sign({ id: user._id }, "SECRETKEY", { expiresIn: "7d" });

    res.json({ message: "Login Success", token });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// VERIFY TOKEN
router.get("/verify", (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) return res.status(401).json({ valid: false });

    jwt.verify(token, "SECRETKEY", (err, decoded) => {
      if (err) return res.status(401).json({ valid: false });
      res.json({ valid: true, id: decoded.id });
    });
  } catch {
    res.status(500).json({ valid: false });
  }
});

module.exports = router;
