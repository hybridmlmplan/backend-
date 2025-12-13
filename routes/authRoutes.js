// backend/routes/authRoutes.js
import express from "express";
import {
  registerUser,
  loginUser,
  getMyProfile,
  checkSponsor,
} from "../controllers/authController.js";
import adminAuth from "../middleware/adminAuth.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| AUTH & SIGNUP ROUTES
|--------------------------------------------------------------------------
| NOTE:
| - Login = userId (number) + password
| - Signup creates user with INACTIVE package
| - Package activation happens ONLY via EPIN
| - PV/BV/Binary logic is NOT here (as per plan)
|--------------------------------------------------------------------------
*/

// =======================
// SIGNUP
// =======================
// Fields expected (controller side):
// name, mobile, email, password,
// sponsorId,
// placementId (optional),
// placement (L/R)
router.post("/signup", registerUser);

// =======================
// LOGIN
// =======================
// userId (numeric login id) + password
router.post("/login", loginUser);

// =======================
// CHECK SPONSOR ID (AJAX / frontend use)
// =======================
router.get("/check-sponsor/:sponsorId", checkSponsor);

// =======================
// MY PROFILE (logged-in user)
// =======================
router.get("/me", adminAuth, getMyProfile);

export default router;
