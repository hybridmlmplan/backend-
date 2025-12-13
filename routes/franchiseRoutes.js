import express from "express";
import {
  createFranchise,
  getMyFranchise,
  getAllFranchises,
  updateFranchiseStatus,
  createFranchiseOrder,
  getFranchiseOrders
} from "../controllers/franchiseController.js";

import adminAuth from "../middleware/adminAuth.js";

const router = express.Router();

/**
 * ===============================
 * FRANCHISE ROUTES
 * ===============================
 * Business Rules:
 * - Referrer gets 1% BV
 * - Franchise holder minimum 5% selling price
 * - Product-wise commission configurable
 * - BV/PV tracking enabled
 */

/**
 * User creates franchise
 */
router.post("/create", createFranchise);

/**
 * Logged-in franchise details
 */
router.get("/me", getMyFranchise);

/**
 * Admin: get all franchises
 */
router.get("/admin/all", adminAuth, getAllFranchises);

/**
 * Admin: activate / deactivate franchise
 */
router.put(
  "/admin/status/:franchiseId",
  adminAuth,
  updateFranchiseStatus
);

/**
 * Franchise product sale (creates order + BV)
 */
router.post("/order/create", createFranchiseOrder);

/**
 * Franchise order history
 */
router.get("/orders", getFranchiseOrders);

export default router;
