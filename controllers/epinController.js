// controllers/epinController.js
import { generateEPINs, assignEPINToUser, redeemEPIN, listEPINs, listEPINsForUser } from "../services/epinService.js";
import { success, fail } from "../utils/response.js";

/**
 * Routes:
 * POST  /api/epin/generate        (admin) body: { packageCode, count }
 * POST  /api/epin/assign          (any user) body: { code, toUserId }  // transfer
 * POST  /api/epin/redeem          (user) body: { code } (user from auth)
 * GET   /api/epin/list            (admin) query filters
 * GET   /api/epin/my              (user) list own epins
 */

export async function generateHandler(req, res) {
  try {
    const { packageCode, count = 1 } = req.body;
    if (!packageCode) return fail(res, "packageCode required");
    const createdBy = req.user ? req.user._id : null;
    const docs = await generateEPINs({ packageCode, count, createdBy });
    return success(res, "EPINs generated", docs);
  } catch (e) {
    console.error("generateHandler", e);
    return fail(res, e.message || "Server error");
  }
}

export async function assignHandler(req, res) {
  try {
    const { code, toUserId } = req.body;
    if (!code || !toUserId) return fail(res, "code and toUserId required");
    const byUserId = req.user ? req.user._id : null;
    const ep = await assignEPINToUser({ code, toUserId, byUserId });
    return success(res, "EPIN assigned", ep);
  } catch (e) {
    console.error("assignHandler", e);
    return fail(res, e.message || "Server error");
  }
}

export async function redeemHandler(req, res) {
  try {
    const code = req.body.code;
    if (!code) return fail(res, "code required");
    if (!req.user) return fail(res, "Auth required");
    const userId = req.user._id;

    const result = await redeemEPIN({ code, userId });
    return success(res, "EPIN redeemed and package activated", result);
  } catch (e) {
    console.error("redeemHandler", e);
    return fail(res, e.message || "Server error");
  }
}

export async function adminListHandler(req, res) {
  try {
    const { packageCode, assignedTo, isUsed, limit = 100, skip = 0 } = req.query;
    const filter = {};
    if (packageCode) filter.packageCode = packageCode;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (typeof isUsed !== "undefined") filter.isUsed = isUsed === "true";

    const docs = await listEPINs({ filter, limit: Number(limit), skip: Number(skip) });
    return success(res, "EPIN list", docs);
  } catch (e) {
    console.error("adminListHandler", e);
    return fail(res, e.message || "Server error");
  }
}

export async function myEPINsHandler(req, res) {
  try {
    if (!req.user) return fail(res, "Auth required");
    const docs = await listEPINsForUser(req.user._id);
    return success(res, "My EPINs", docs);
  } catch (e) {
    console.error("myEPINsHandler", e);
    return fail(res, e.message || "Server error");
  }
}
