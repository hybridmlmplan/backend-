// routes/rankRoutes.js
import express from "express";
import { handlePairPaid, rankProgressHandler, rankDefinitionsHandler } from "../controllers/rankController.js";
import { authMiddleware, adminMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Called internally by binary payout flow when a pair is paid for a user
router.post("/on-pair-paid", adminMiddleware, handlePairPaid);

// Get rank progress for a user
router.get("/progress/:userCode", authMiddleware, rankProgressHandler);

// Get rank definitions (admin or public)
router.get("/definitions/:packageType", authMiddleware, rankDefinitionsHandler);

export default router;
