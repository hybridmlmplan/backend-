import express from "express";
import { signup, login } from "../controllers/authController.js";

const router = express.Router();

// PUBLIC ROUTES
router.post("/signup", signup);
router.post("/login", login);

export default router;
const express = require("express");
const router = express.Router();

const {
  signupUser,
  loginUser,
  registerUser
} = require("../controllers/authController");

// ===========================
// SIGNUP
// ===========================
router.post("/signup", signupUser);

// ===========================
// LOGIN
// ===========================
router.post("/login", loginUser);

// ===========================
// FULL KYC REGISTRATION
// ===========================
router.post("/register", registerUser);

module.exports = router;
