// controllers/binaryController.js
import { createPairManual, processSessionPairs, getPendingPairsForUser } from "../services/binaryService.js";
import Binary from "../models/Binary.js";
import SessionModel from "../models/Session.js";
import { success, fail } from "../utils/response.js";

/**
 * Routes:
 * POST /api/binary/create-manual    (admin) — create pair between two users
 * POST /api/binary/process-session  (admin) — trigger processing for sessionNumber & date
 * GET  /api/binary/pending          (user) — pending red pairs for logged user
 * GET  /api/binary/pairs            (admin) — list pairs (filter)
 */

export async function createManualPairHandler(req, res) {
  try {
    const { leftUserId, rightUserId, packageType, sessionNumber } = req.body;
    if (!leftUserId || !rightUserId || !packageType || !sessionNumber) return fail(res, "Missing fields");
    const p = await createPairManual({ leftUserId, rightUserId, packageType, sessionNumber, sessionDate: new Date() });
    return success(res, "Pair created", p);
  } catch (e) {
    console.error("createManualPairHandler", e);
    return fail(res, "Server error");
  }
}

export async function processSessionHandler(req, res) {
  try {
    const { sessionNumber, date } = req.body;
    if (!sessionNumber) return fail(res, "sessionNumber required");
    const sessionDate = date ? new Date(date) : new Date();
    const result = await processSessionPairs(sessionNumber, sessionDate);
    return success(res, "Session processed", result);
  } catch (e) {
    console.error("processSessionHandler", e);
    return fail(res, "Server error");
  }
}

export async function pendingPairsHandler(req, res) {
  try {
    // req.user should be set by auth middleware; in testing may be null
    const user = req.user;
    if (!user) return fail(res, "Auth required", 401);
    const data = await getPendingPairsForUser(user._id);
    return success(res, "Pending pairs", data);
  } catch (e) {
    console.error("pendingPairsHandler", e);
    return fail(res, "Server error");
  }
}

export async function listPairsHandler(req, res) {
  try {
    const { status = null, packageType = null, limit = 100 } = req.query;
    const q = {};
    if (status) q.status = status;
    if (packageType) q.packageType = packageType;
    const pairs = await Binary.find(q).sort({ createdAt: -1 }).limit(parseInt(limit, 10));
    return success(res, "Pairs", pairs);
  } catch (e) {
    console.error("listPairsHandler", e);
    return fail(res, "Server error");
  }
}
