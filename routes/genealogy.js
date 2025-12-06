import express from "express";
import {
  getDirectsByUser,
  getTreeByUser,
  placeUserInTree,
  getDownline
} from "../controllers/genealogyController.js";

import {
  protect,
  verifyAdmin
} from "../middleware/authMiddleware.js";

const router = express.Router();

// PUBLIC TEST ROUTE (no token)
router.get("/directs/:userId", getDirectsByUser);

// GET TREE (protected)
router.get("/tree/:userId", protect, getTreeByUser);

// PLACE USER (admin)
router.post("/place-user", verifyAdmin, placeUserInTree);

// GET DOWNLINE (protected)
router.get("/downline/:userId/:level?", protect, getDownline);

export default router;
