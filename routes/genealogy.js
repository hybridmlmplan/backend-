import express from "express";
import {
  getTreeByUser,
  placeUserInTree,
  getDownline,
  getDirectsByUser
} from "../controllers/genealogyController.js";

import {
  protect,
  verifyAdmin
} from "../middleware/authMiddleware.js";

const router = express.Router();

// =============================
// GET TREE
// =============================
router.get("/tree/:userId", protect, getTreeByUser);

// =============================
// PLACE USER (admin)
// =============================
router.post("/place-user", verifyAdmin, placeUserInTree);

// =============================
// GET DOWNLINE (optional level)
// =============================
router.get("/downline/:userId/:level?", protect, getDownline);

// ====================================
// NEW: GET DIRECT TEAM LIST
// ====================================
router.get("/directs/:userId", protect, getDirectsByUser);

export default router;
