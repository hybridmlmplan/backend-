// routes/fundRoutes.js
import express from "express";
import { addBV, distributeOne, distributeAll, pools } from "../controllers/fundController.js";
import { adminMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Add BV manually
router.post("/bv", adminMiddleware, addBV);

// process one pool
router.post("/distribute/:pool", adminMiddleware, distributeOne);

// process all pools
router.post("/distribute", adminMiddleware, distributeAll);

// get pool stats
router.get("/", adminMiddleware, pools);

export default router;
