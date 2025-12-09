// controllers/rankController.js
import { onPairPaid, getRankProgress } from "../services/rankService.js";
import User from "../models/User.js";
import Rank from "../models/Rank.js";
import { success, fail } from "../utils/response.js";

/**
 * Endpoints:
 * POST /api/rank/on-pair-paid    <- internal webhook (called by binary service when payout done)
 * GET  /api/rank/progress/:userCode
 * GET  /api/rank/definitions/:packageType
 */

export async function handlePairPaid(req, res) {
  try {
    const { userId, packageType } = req.body;
    if (!userId || !packageType) return fail(res, "userId and packageType required");

    const result = await onPairPaid(userId, packageType);
    return success(res, "Processed rank update", result);
  } catch (e) {
    console.error("handlePairPaid", e);
    return fail(res, "Server error");
  }
}

export async function rankProgressHandler(req, res) {
  try {
    const { userCode } = req.params;
    if (!userCode) return fail(res, "userCode required");

    const user = await User.findOne({ userCode }).select("_id userCode");
    if (!user) return fail(res, "User not found");

    const progress = await getRankProgress(user._id);
    return success(res, "Rank progress", progress);
  } catch (e) {
    console.error("rankProgressHandler", e);
    return fail(res, "Server error");
  }
}

export async function rankDefinitionsHandler(req, res) {
  try {
    const { packageType } = req.params;
    if (!packageType) return fail(res, "packageType required");
    const defs = await Rank.find({ packageType }).sort({ level: 1 }).lean();
    return success(res, "Rank definitions", defs);
  } catch (e) {
    console.error("rankDefinitionsHandler", e);
    return fail(res, "Server error");
  }
}
