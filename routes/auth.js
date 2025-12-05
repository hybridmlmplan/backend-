import express from "express";

// Controllers
import {
  signup,
  login,
} from "../controllers/authController.js";

const router = express.Router();

// =======================================================
// AUTH ROUTES
// =======================================================

// USER SIGNUP (Basic Registration)
router.post("/signup", signup);

// USER LOGIN (Phone + Password)
router.post("/login", login);

// HEALTH CHECK (OPTIONAL: Good for testing deployment)
router.get("/health", (req, res) => {
  res.status(200).json({
    status: true,
    message: "Auth service running",
  });
});

export default router;
