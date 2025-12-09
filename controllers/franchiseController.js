// controllers/franchiseController.js
import { createFranchise, purchaseFranchise, listFranchiseOrders } from "../services/franchiseService.js";
import { success, fail } from "../utils/response.js";

/**
 * Routes:
 * POST /api/franchise/create   (admin) { userId, commissionPercent, referrerPercent }
 * POST /api/franchise/purchase (user)  { price, bv, referrerId }
 * GET  /api/franchise/orders   (admin) ?limit & skip
 */

export async function createHandler(req, res) {
  try {
    const { userId, commissionPercent = 5, referrerPercent = 1 } = req.body;
    if (!userId) return fail(res, "userId required");
    const fr = await createFranchise({ userId, commissionPercent, referrerPercent });
    return success(res, "Franchise created", fr);
  } catch (e) {
    console.error("createHandler", e);
    return fail(res, e.message || "Server error");
  }
}

export async function purchaseHandler(req, res) {
  try {
    if (!req.user) return fail(res, "Auth required");
    const { price, bv = 0, referrerId = null } = req.body;
    if (!price) return fail(res, "price required");
    const r = await purchaseFranchise({ buyerId: req.user._id, price: Number(price), bv: Number(bv), referrerId });
    return success(res, "Franchise purchased", r);
  } catch (e) {
    console.error("purchaseHandler", e);
    return fail(res, e.message || "Server error");
  }
}

export async function listOrdersHandler(req, res) {
  try {
    const { limit = 100, skip = 0 } = req.query;
    const docs = await listFranchiseOrders({ limit: Number(limit), skip: Number(skip) });
    return success(res, "Franchise orders", docs);
  } catch (e) {
    console.error("listOrdersHandler", e);
    return fail(res, e.message || "Server error");
  }
}
