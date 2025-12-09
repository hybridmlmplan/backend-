// controllers/fundController.js
import { addBVtoPools, distributePool, distributeAllPools, getPools } from "../services/fundService.js";
import { success, fail } from "../utils/response.js";

// add BV (admin)
export async function addBV(req, res) {
  try {
    const { bv } = req.body;
    if (!bv || bv <= 0) return fail(res, "Invalid BV");
    await addBVtoPools(bv);
    return success(res, "BV added to pools");
  } catch (e) {
    console.error("addBV", e);
    return fail(res, "Server error");
  }
}

// distribute one
export async function distributeOne(req, res) {
  try {
    const { pool } = req.params;
    const r = await distributePool(pool);
    return success(res, "Pool processed", r);
  } catch (e) {
    console.error("distributeOne", e);
    return fail(res, "Server error");
  }
}

// distribute all
export async function distributeAll(req, res) {
  try {
    const r = await distributeAllPools();
    return success(res, "All pools processed", r);
  } catch (e) {
    console.error("distributeAll", e);
    return fail(res, "Server error");
  }
}

// get pool stats
export async function pools(req, res) {
  try {
    const data = await getPools();
    return success(res, "Pools", data);
  } catch (e) {
    console.error("pools", e);
    return fail(res, "Server error");
  }
}
