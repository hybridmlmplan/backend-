// ==================================================
// FUND ROUTES
// ==================================================

import express from "express";
import {
  processFundIncome,
  getUserFundSummary,
} from "../services/fundService.js";

const router = express.Router();


// --------------------------------------------------
// 1. PROCESS FUND INCOME
// --------------------------------------------------
//
// POST /api/fund/process
//
// body: { userId }
//

router.post("/process", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        status: false,
        message: "userId required",
      });
    }

    const result = await processFundIncome(userId);

    return res.status(200).json({
      status: true,
      message: "Fund income processed successfully",
      result,
    });

  } catch (err) {
    console.log("Fund process error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
});



// --------------------------------------------------
// 2. GET USER FUND SUMMARY
// --------------------------------------------------
//
// GET /api/fund/summary/:userId
//
// params: userId
//

router.get("/summary/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await getUserFundSummary(userId);

    if (!result) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      status: true,
      summary: result,
    });

  } catch (err) {
    console.log("Fund summary error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
});



// --------------------------------------------------
// DEFAULT EXPORT
// --------------------------------------------------

export default router;
