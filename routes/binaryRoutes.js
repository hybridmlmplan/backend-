// routes/binaryRoutes.js
import express from "express";
import asyncHandler from "express-async-handler";
import Binary from "../models/Binary.js";
import SessionModel from "../models/Session.js";
import { processSessionPairs } from "../scripts/binaryEngine.js";
import adminAuth from "../middleware/adminAuth.js";

let binaryController;
try {
  // prefer using controller if available
  // (your project listed controllers/binaryController.js as ok)
  // eslint-disable-next-line no-eval
  binaryController = await import("../controllers/binaryController.js");
} catch (e) {
  // controller missing — route will use internal handlers
  binaryController = null;
}

const router = express.Router();

/**
 * POST /api/binary/place
 * Create a binary placement (RED pair node) when user activates package using EPIN.
 * Body: { userId, packageCode: "silver"|"gold"|"ruby", side: "L"|"R", pv? }
 */
router.post(
  "/place",
  asyncHandler(async (req, res) => {
    const { userId, packageCode, side } = req.body;

    if (!userId || !packageCode || !side) {
      return res.status(400).json({ status: false, message: "Missing required fields" });
    }
    if (!["L", "R"].includes(side)) {
      return res.status(400).json({ status: false, message: "side must be 'L' or 'R'" });
    }

    // If controller exists delegate
    if (binaryController && binaryController.createPlacement) {
      return binaryController.createPlacement(req, res);
    }

    // fallback simple creation logic (RED by default)
    const pvMap = { silver: 35, gold: 155, ruby: 1250 };
    const pv = pvMap[packageCode] || 35;

    const entry = await Binary.create({
      userId,
      packageCode,
      side,
      pv,
      isGreen: false,
      createdAt: new Date()
    });

    return res.status(201).json({ status: true, message: "Placement created", data: entry });
  })
);

/**
 * GET /api/binary/pending
 * List all RED (pending) binary nodes optionally filtered by package or side
 * Query params: packageCode, side, limit, skip
 */
router.get(
  "/pending",
  asyncHandler(async (req, res) => {
    const { packageCode, side, limit = 100, skip = 0 } = req.query;

    if (binaryController && binaryController.getPendingPairs) {
      return binaryController.getPendingPairs(req, res);
    }

    const q = { isGreen: false };
    if (packageCode) q.packageCode = packageCode;
    if (side) q.side = side;

    const rows = await Binary.find(q).sort({ createdAt: 1 }).skip(Number(skip)).limit(Number(limit)).lean();
    const total = await Binary.countDocuments(q);

    return res.json({ status: true, total, data: rows });
  })
);

/**
 * GET /api/binary/user/:userId
 * Get binary entries for a user
 */
router.get(
  "/user/:userId",
  asyncHandler(async (req, res) => {
    if (binaryController && binaryController.getUserBinaries) {
      return binaryController.getUserBinaries(req, res);
    }

    const { userId } = req.params;
    const rows = await Binary.find({ userId }).sort({ createdAt: -1 }).lean();
    return res.json({ status: true, count: rows.length, data: rows });
  })
);

/**
 * POST /api/binary/process-session
 * Admin only - trigger session engine to process red->green matching for a given sessionNumber.
 * Body: { sessionNumber, sessionStartISO? } 
 */
router.post(
  "/process-session",
  adminAuth,
  asyncHandler(async (req, res) => {
    const { sessionNumber, sessionStartISO } = req.body;

    if (!sessionNumber && sessionNumber !== 0) {
      return res.status(400).json({ status: false, message: "sessionNumber is required" });
    }

    // if controller provides wrapper, use it
    if (binaryController && binaryController.processSession) {
      return binaryController.processSession(req, res);
    }

    // call engine directly
    const sessionStart = sessionStartISO ? new Date(sessionStartISO) : new Date();
    const result = await processSessionPairs(Number(sessionNumber), sessionStart);

    if (!result || result.status === false) {
      return res.status(500).json({ status: false, message: "Session processing failed", error: result?.error });
    }

    // return processed summary and session record (if created)
    const sessionRecord = await SessionModel.findOne({ sessionNumber }).lean();
    return res.json({ status: true, processed: result.processed, session: sessionRecord ?? null });
  })
);

/**
 * GET /api/binary/session/:sessionNumber
 * Fetch session record
 */
router.get(
  "/session/:sessionNumber",
  asyncHandler(async (req, res) => {
    if (binaryController && binaryController.getSession) {
      return binaryController.getSession(req, res);
    }

    const { sessionNumber } = req.params;
    const rec = await SessionModel.findOne({ sessionNumber: Number(sessionNumber) }).lean();
    if (!rec) return res.status(404).json({ status: false, message: "Session not found" });
    return res.json({ status: true, data: rec });
  })
);

/**
 * GET /api/binary/stats/today
 * Quick stats for today: pending counts per package, today's processed pairs
 */
router.get(
  "/stats/today",
  asyncHandler(async (req, res) => {
    // controller fallback
    if (binaryController && binaryController.getTodayStats) {
      return binaryController.getTodayStats(req, res);
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const pendingCounts = await Binary.aggregate([
      { $match: { isGreen: false } },
      { $group: { _id: "$packageCode", count: { $sum: 1 } } }
    ]);

    const processedToday = await SessionModel.aggregate([
      { $match: { createdAt: { $gte: startOfDay } } },
      { $group: { _id: null, totalPairs: { $sum: "$processedPairsCount" } } }
    ]);

    return res.json({
      status: true,
      pending: pendingCounts,
      processedToday: processedToday[0]?.totalPairs || 0
    });
  })
);

export default router;
