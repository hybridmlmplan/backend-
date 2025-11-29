const express = require("express");
const router = express.Router();

const {
  signupUser,
  loginUser,
  registerUser
} = require("../controllers/authController");

// ===========================
// SIGNUP (Basic Account Create)
// ===========================
router.post("/signup", signupUser);

// ===========================
// LOGIN (Password Based Only)
// ===========================
router.post("/login", loginUser);

// ===========================
// FULL KYC REGISTRATION FORM
// ===========================
router.post("/register", registerUser);

module.exports = router;
