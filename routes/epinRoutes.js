// routes/epinRoutes.js
import express from "express";
import { generateHandler, assignHandler, redeemHandler, adminListHandler, myEPINsHandler } from "../controllers/epinController.js";
import { authMiddleware, adminMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Admin: bulk generate
router.post("/generate", adminMiddleware, generateHandler);

// Admin: list epins
router.get("/list", adminMiddleware, adminListHandler);

// Any authenticated user: transfer epin to another user (no admin approval needed)
router.post("/assign", authMiddleware, assignHandler);

// Authenticated user: list own epins
router.get("/my", authMiddleware, myEPINsHandler);

// Authenticated user: redeem epin (activate package)
router.post("/redeem", authMiddleware, redeemHandler);

export default router;
