// controllers/royaltyController.js
import { distributeRoyalty } from "../services/royaltyService.js";
import RoyaltyLog from "../models/RoyaltyLog.js";
import { success, fail } from "../utils/response.js";

/**
 * Routes:
 * POST /api/royalty/distribute   (admin) body: { bv }
 * GET  /api/royalty/logs        (admin) query: limit, skip
 */

export async function distributeHandler(req, res) {
  try {
    const { bv } = req.body;
    if (!bv || Number(bv) <= 0) return fail(res, "bv required");
    const r = await distributeRoyalty(Number(bv));
    return success(res, "Royalty distributed", r);
  } catch (e) {
    console.error("distributeHandler", e);
    return fail(res, e.message || "Server error");
  }
}

export async function logsHandler(req, res) {
  try {
    const { limit = 100, skip = 0 } = req.query;
    const docs = await RoyaltyLog.find({}).sort({ createdAt: -1 }).skip(Number(skip)).limit(Number(limit)).lean();
    return success(res, "Royalty logs", docs);
  } catch (e) {
    console.error("logsHandler", e);
    return fail(res, e.message || "Server error");
  }
}
