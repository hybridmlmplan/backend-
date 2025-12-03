import express from "express";
import {
  signup,
  login,
} from "../controllers/authController.js";

const router = express.Router();

// ==========================
// AUTH ROUTES
// ==========================

// Signup → Basic account creation
router.post("/signup", signup);

// Login → Password based login
router.post("/login", login);

export default router;
