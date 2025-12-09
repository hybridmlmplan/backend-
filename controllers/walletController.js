// controllers/walletController.js
import walletService from "../services/walletService.js";
import { success, fail } from "../utils/response.js";

/**
 * Routes:
 * GET  /api/wallet/me            -> user wallet summary
 * POST /api/wallet/withdraw      -> create withdraw request
 * GET  /api/wallet/ledger        -> ledger (with pagination)
 * POST /api/wallet/admin/approve -> admin approve withdraw (admin only)
 * POST /api/wallet/admin/credit  -> admin credit to user
 */

export async function myWalletHandler(req, res) {
  try {
    if (!req.user) return fail(res, "Auth required");
    const { limit = 50, skip = 0 } = req.query;
    const data = await walletService.getWalletSummary(req.user._id, { limit: Number(limit), skip: Number(skip) });
    return success(res, "Wallet summary", data);
  } catch (e) {
    console.error("myWalletHandler", e);
    return fail(res, e.message || "Server error");
  }
}

export async function withdrawRequestHandler(req, res) {
  try {
    if (!req.user) return fail(res, "Auth required");
    const { amount, note } = req.body;
    if (!amount || Number(amount) <= 0) return fail(res, "Amount required");
    const r = await walletService.createWithdrawRequest(req.user._id, Number(amount), { note });
    return success(res, "Withdraw request created", r);
  } catch (e) {
    console.error("withdrawRequestHandler", e);
    return fail(res, e.message || "Server error");
  }
}

export async function ledgerHandler(req, res) {
  try {
    if (!req.user) return fail(res, "Auth required");
    const { limit = 50, skip = 0 } = req.query;
    const data = await walletService.getWalletSummary(req.user._id, { limit: Number(limit), skip: Number(skip) });
    return success(res, "Wallet ledger", data);
  } catch (e) {
    console.error("ledgerHandler", e);
    return fail(res, e.message || "Server error");
  }
}

// Admin approve withdraw
export async function adminApproveHandler(req, res) {
  try {
    const { txId, note } = req.body;
    if (!txId) return fail(res, "txId required");
    const r = await walletService.adminApproveWithdraw(txId, note || "");
    return success(res, "Withdraw approved", r);
  } catch (e) {
    console.error("adminApproveHandler", e);
    return fail(res, e.message || "Server error");
  }
}

// Admin credit
export async function adminCreditHandler(req, res) {
  try {
    const { userId, amount, note } = req.body;
    if (!userId || !amount || Number(amount) <= 0) return fail(res, "userId and amount required");
    const r = await walletService.adminCredit(userId, Number(amount), "admin", note || "Admin credit");
    return success(res, "User credited", r);
  } catch (e) {
    console.error("adminCreditHandler", e);
    return fail(res, e.message || "Server error");
  }
}
