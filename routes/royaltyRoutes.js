// ============================================================
// ROYALTY ROUTES
// Business Plan: Silver Ranks Only (3% → 1%–8% continuous)
// All royalty from BV only (repurchase, services)
// ============================================================

import express from "express";
import RoyaltyService from "../services/royaltyService.js";
import { authenticateUser, isAdmin } from "../middleware/auth.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| 1) ADMIN – TRIGGER DAILY ROYALTY DISTRIBUTION
|--------------------------------------------------------------------------
| CTO BV Pool = Company Total Output BV
| Silver Ranks Eligible:
|   - 3% until ₹35
|   - Then rank-wise 1% to 8%
| Royalty = Lifetime (never stops)
*/
router.post(
  "/admin/distribute",
  authenticateUser,
  isAdmin,
  async (req, res) => {
    try {
      const result = await RoyaltyService.distributeRoyalty();
      return res.status(200).json({
        status: true,
        message: "Royalty distributed successfully",
        data: result,
      });
    } catch (err) {
      console.error("Royalty distribution error:", err);
      return res.status(500).json({
        status: false,
        message: "Server Error during royalty distribution",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| 2) ADMIN – GET FULL ROYALTY REPORT
|--------------------------------------------------------------------------
| Includes:
|   - All eligible users
|   - Rank-based %
|   - Previous royalities
|   - This cycle calculations
*/
router.get(
  "/admin/report",
  authenticateUser,
  isAdmin,
  async (req, res) => {
    try {
      const report = await RoyaltyService.getRoyaltyReport();
      return res.status(200).json({
        status: true,
        data: report,
      });
    } catch (err) {
      console.error("Royalty report error:", err);
      return res.status(500).json({
        status: false,
        message: "Server Error fetching royalty report",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| 3) USER – GET OWN ROYALTY HISTORY
|--------------------------------------------------------------------------
| User can see:
|   - Royalty payouts
|   - Rank percentage
|   - Date & amount history
*/
router.get(
  "/user/history",
  authenticateUser,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const data = await RoyaltyService.getUserRoyaltyHistory(userId);

      return res.status(200).json({
        status: true,
        data,
      });
    } catch (err) {
      console.error("User royalty history error:", err);
      return res.status(500).json({
        status: false,
        message: "Server Error fetching user royalty history",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| 4) ADMIN – UPDATE CTO BV POOL
|--------------------------------------------------------------------------
| Admin adds company BV (repurchase/services)
| System uses this pool for royalty calculation
*/
router.post(
  "/admin/update-ctobv",
  authenticateUser,
  isAdmin,
  async (req, res) => {
    try {
      const { amount } = req.body;
      if (!amount || amount <= 0) {
        return res.status(400).json({
          status: false,
          message: "Valid amount required",
        });
      }

      const updated = await RoyaltyService.updateCTOPool(amount);

      return res.status(200).json({
        status: true,
        message: "CTO BV Pool updated",
        data: updated,
      });
    } catch (err) {
      console.error("CTO BV update error:", err);
      return res.status(500).json({
        status: false,
        message: "Server Error updating CTO BV pool",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| EXPORT ROUTER
|--------------------------------------------------------------------------
*/
export default router;
