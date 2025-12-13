// backend/routes/packageRoutes.js

import express from "express";
import adminAuth from "../middleware/adminAuth.js";
import {
  listPackages,
  myPackageStatus,
  activatePackageByEPIN,
} from "../controllers/packageController.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| PACKAGE ROUTES — PLAN ALIGNED
|--------------------------------------------------------------------------
| BUSINESS RULES (as per FINAL PLAN):
| - Packages: Silver / Gold / Ruby
| - Signup ke time package NON-ACTIVE
| - Package activation ONLY via EPIN
| - No renewal, no expiry
| - PV sirf Binary (red → green) ke liye
| - BV se Rank / Royalty / Fund / Level income
| - Silver package decides Gold/Ruby red-green order
|--------------------------------------------------------------------------
*/

// ===================================
// GET PACKAGE MASTER (for frontend UI)
// ===================================
// Returns:
// Silver: ₹35 | PV 35 | Pair ₹10
// Gold  : ₹155 | PV 155 | Pair ₹50
// Ruby  : ₹1250 | PV 1250 | Pair ₹500
router.get("/list", listPackages);

// ===================================
// GET LOGGED-IN USER PACKAGE STATUS
// ===================================
// Shows:
// active / inactive packages
// current cycle
// completed sessions
router.get("/my-status", adminAuth, myPackageStatus);

// ===================================
// ACTIVATE PACKAGE USING EPIN
// ===================================
// body:
// {
//   packageType: "silver" | "gold" | "ruby",
//   epinCode: "XXXX-XXXX"
// }
//
// NOTE:
// - EPIN unlimited
// - No expiry
// - Activation triggers PV entry
// - Binary / session engine runs separately
router.post("/activate", adminAuth, activatePackageByEPIN);

export default router;
