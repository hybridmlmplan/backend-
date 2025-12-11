// backend/controllers/binaryController.js
// Controller for binary placements (PV entries) and session trigger endpoints
// Implements endpoints used by frontend/admin and the session engine
//
// Endpoints (suggested wiring in routes/binaryRoutes.js):
// POST   /api/binary/place         -> placeBinary (user places a PV via EPIN / purchase)
// GET    /api/binary/user/:id      -> getUserBinaryEntries
// GET    /api/binary/pending       -> getPendingBinaryEntries (admin)
// POST   /api/binary/process       -> processSession (admin / scheduler: triggers session engine)
//
// NOTE:
// - This controller focuses on create/read + triggering engine. Core matching/crediting is in scripts/binaryEngine.js
// - It expects models: User, Binary, Session and engine: processSessionPairs
// - Validate inputs but keep logic simple — business rules (caps, red->green rules, pair matching) live in engine.

import express from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import Binary from "../models/Binary.js";
import SessionModel from "../models/Session.js";
import { processSessionPairs } from "../scripts/binaryEngine.js"; // session engine
import BVLedger from "../models/BVLedger.js"; // optional BV interactions
import EPIN from "../models/EPIN.js";

const router = express.Router();

/**
 * Place a binary PV entry (called when user activates package via EPIN / purchase)
 * Request body:
 * {
 *   userId: "609abc...",
 *   packageCode: "silver" | "gold" | "ruby",
 *   side: "L" | "R",              // optional: frontend may send side; if omitted server can auto-assign (simple fallback below)
 *   epin: "ABCDEF"                // optional if activation via EPIN
 * }
 */
export async function placeBinary(req, res) {
  try {
    const { userId, packageCode = "silver", side, epin } = req.body;

    // basic validation
    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ status: false, message: "Invalid or missing userId" });
    }
    if (!["silver", "gold", "ruby"].includes(packageCode)) {
      return res.status(400).json({ status: false, message: "Invalid packageCode" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ status: false, message: "User not found" });

    // If EPIN provided — validate (EPIN model expected to exist)
    if (epin) {
      const token = await EPIN.findOne({ code: epin, used: false });
      if (!token) {
        return res.status(400).json({ status: false, message: "Invalid or used EPIN" });
      }
      // optionally mark EPIN used (admin may want to mark later after full activation)
      token.used = true;
      token.usedBy = userId;
      token.usedAt = new Date();
      await token.save();
    }

    // Decide side: if provided use that, else pick the side with fewer red entries for user to balance simple placements
    let placementSide = side && (side === "L" || side === "R") ? side : null;
    if (!placementSide) {
      const counts = await Binary.aggregate([
        { $match: { userId: mongoose.Types.ObjectId(userId), packageCode } },
        {
          $group: {
            _id: "$side",
            count: { $sum: 1 }
          }
        }
      ]);
      const left = counts.find((c) => c._id === "L")?.count || 0;
      const right = counts.find((c) => c._id === "R")?.count || 0;
      placementSide = left <= right ? "L" : "R";
    }

    // Create Binary entry (red by default)
    const binaryEntry = await Binary.create({
      userId,
      packageCode,
      side: placementSide,
      pv: packageCode === "silver" ? 35 : packageCode === "gold" ? 155 : 1250,
      isGreen: false,
      createdAt: new Date()
    });

    return res.status(201).json({
      status: true,
      message: "PV placed (red). Will be considered in session matching.",
      binaryId: binaryEntry._id,
      packageCode,
      side: placementSide
    });
  } catch (err) {
    console.error("placeBinary ERROR:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
}

/**
 * Get binary entries for a user (all / or filter by package / status)
 * Query params: packageCode (optional), isGreen (optional: true|false)
 */
export async function getUserBinaryEntries(req, res) {
  try {
    const userId = req.params.id;
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ status: false, message: "Invalid user id" });
    }
    const { packageCode, isGreen } = req.query;
    const q = { userId: mongoose.Types.ObjectId(userId) };
    if (packageCode) q.packageCode = packageCode;
    if (typeof isGreen !== "undefined") q.isGreen = isGreen === "true";

    const entries = await Binary.find(q).sort({ createdAt: 1 }).lean();
    return res.json({ status: true, count: entries.length, entries });
  } catch (err) {
    console.error("getUserBinaryEntries ERROR:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
}

/**
 * Admin: get pending red binary entries (optionally per package)
 * Query: packageCode (optional), limit, skip
 */
export async function getPendingBinaryEntries(req, res) {
  try {
    const { packageCode, limit = 200, skip = 0 } = req.query;
    const q = { isGreen: false };
    if (packageCode) q.packageCode = packageCode;

    const total = await Binary.countDocuments(q);
    const entries = await Binary.find(q).sort({ createdAt: 1 }).limit(parseInt(limit)).skip(parseInt(skip)).lean();

    return res.json({ status: true, total, count: entries.length, entries });
  } catch (err) {
    console.error("getPendingBinaryEntries ERROR:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
}

/**
 * Trigger a session processing run (admin or scheduler)
 * Body: { sessionNumber: Number, sessionStart: ISOString (optional) }
 * This calls the session engine (processSessionPairs) which does the matching/crediting.
 */
export async function triggerSession(req, res) {
  try {
    const { sessionNumber, sessionStart } = req.body;
    if (typeof sessionNumber === "undefined") {
      return res.status(400).json({ status: false, message: "sessionNumber is required" });
    }

    const startDt = sessionStart ? new Date(sessionStart) : new Date();

    // call engine (it returns processed count)
    const result = await processSessionPairs(sessionNumber, startDt);

    if (!result || result.status === false) {
      return res.status(500).json({ status: false, message: "Session processing failed", error: result?.error || "unknown" });
    }

    // Optionally return session saved doc summary (engine already saves SessionModel)
    const sessionDoc = await SessionModel.findOne({ sessionNumber }).sort({ createdAt: -1 }).lean();

    return res.json({
      status: true,
      message: "Session processed",
      processed: result.processed || 0,
      session: sessionDoc || null
    });
  } catch (err) {
    console.error("triggerSession ERROR:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
}

/**
 * Admin helper: force-mark a binary pair as green (useful for manual fixes)
 * Body: { leftId, rightId, sessionNumber }
 */
export async function forceMarkPairGreen(req, res) {
  try {
    const { leftId, rightId, sessionNumber } = req.body;
    if (!leftId || !rightId) return res.status(400).json({ status: false, message: "leftId and rightId required" });

    const left = await Binary.findById(leftId);
    const right = await Binary.findById(rightId);
    if (!left || !right) return res.status(404).json({ status: false, message: "Binary entry not found" });

    if (left.isGreen || right.isGreen) {
      return res.status(400).json({ status: false, message: "One or both entries already green" });
    }

    left.isGreen = true;
    left.matchedWith = right._id;
    left.sessionMatched = sessionNumber || null;
    left.matchedAt = new Date();

    right.isGreen = true;
    right.matchedWith = left._id;
    right.sessionMatched = sessionNumber || null;
    right.matchedAt = new Date();

    await left.save();
    await right.save();

    return res.json({ status: true, message: "Pair forced green", leftId, rightId });
  } catch (err) {
    console.error("forceMarkPairGreen ERROR:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
}

/* ----- Router bindings (if you prefer controller export + route wiring elsewhere) ----- */
// If you use direct router from this file, uncomment below:
//
// router.post("/place", placeBinary);
// router.get("/user/:id", getUserBinaryEntries);
// router.get("/pending", getPendingBinaryEntries);
// router.post("/process", triggerSession);
// router.post("/force-green", forceMarkPairGreen);
//
// export default router;

export default {
  placeBinary,
  getUserBinaryEntries,
  getPendingBinaryEntries,
  triggerSession,
  forceMarkPairGreen
};
