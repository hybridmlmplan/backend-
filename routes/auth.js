import express from "express";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = express.Router();

// SIGNUP
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const exist = await User.findOne({ email });
    if (exist) return res.json({ message: "User already exist" });

    const hash = await bcrypt.hash(password, 10);

    await User.create({ name, email, password: hash });

    res.json({ message: "Signup success" });
  } catch (error) {
    res.json({ message: "Error", error });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.json({ message: "No user found" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.json({ message: "Wrong password" });

  const token = jwt.sign({ id: user._id }, "SECRET");

  res.json({ message: "Login success", token });
});

export default router;
