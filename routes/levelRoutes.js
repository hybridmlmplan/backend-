// ==================================================
// LEVEL ROUTES
// ==================================================

import express from "express";
import {
  processLevelIncome,
  getUserLevelSummary,
} from "../services/levelService.js";

const router = express.Router();


// --------------------------------------------------
// 1. PROCESS LEVEL INCOME FOR USER
// --------------------------------------------------
//
// POST /api/level/process
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

    const result = await processLevelIncome(userId);

    return res.status(200).json({
      status: true,
      message: "Level income processed successfully",
      result,
    });

  } catch (err) {
    console.log("Level process error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
});



// --------------------------------------------------
// 2. GET USER LEVEL SUMMARY
// --------------------------------------------------
//
// GET /api/level/summary/:userId
//
// params: userId
//

router.get("/summary/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await getUserLevelSummary(userId);

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
    console.log("Level summary error:", err);
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
