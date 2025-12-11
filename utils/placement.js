// utils/placement.js
// Production-ready placement utilities for the Hybrid MLM Plan
// - placeUser(...) : main API to place a new user in binary tree
// - findNearestFreeSlot(...) : BFS + atomic reservation attempts
//
// Expected User schema (Mongoose) (adjust names if different):
// User {
//   userId: String (e.g. "GSM0001"),    // business id (unique)
//   sponsorId: String,                  // sponsor's userId
//   placementId: String,                // parent/placement userId
//   left: String|null,                  // left child userId
//   right: String|null,                 // right child userId
//   ... other fields ...
// }
//
// Important: This module uses atomic findOneAndUpdate operations to set left/right
// to avoid race conditions. For extra safety you can call placeUser inside a
// MongoDB transaction session (session param supported).
//
// Usage example:
//   const placement = await placeUser({ newUserId: "GSM0005", sponsorId: "GSM0001", placementId: null, preferredSide: "left" });
//   // returns: { success: true, placedUnder: "GSM0003", side: "right" }

import mongoose from "mongoose";
import User from "../models/User.js"; // adjust path if needed

/**
 * Try to atomically set a side (left/right) for a user if it's empty.
 * Returns true if succeeded.
 * @param {String} parentUserId - userId of parent
 * @param {'left'|'right'} side
 * @param {String} childUserId - userId to set
 * @param {Object} [session] - optional mongoose session for transaction
 */
async function trySetChildAtomically(parentUserId, side, childUserId, session = null) {
  if (!parentUserId || !side || !childUserId) return false;
  const filter = { userId: parentUserId, [side]: { $in: [null, undefined, ""] } };
  const update = { $set: { [side]: childUserId } };
  const options = { new: true };
  if (session) options.session = session;

  const updated = await User.findOneAndUpdate(filter, update, options).lean();
  return !!updated;
}

/**
 * Get children (left,right) for a userId (returns { left, right })
 */
async function getChildren(userId) {
  if (!userId) return { left: null, right: null };
  const u = await User.findOne({ userId }).select("left right").lean();
  if (!u) return { left: null, right: null };
  return { left: u.left || null, right: u.right || null };
}

/**
 * BFS search for nearest free slot starting from rootUserId.
 * It will attempt atomic set of preferredSide first for each candidate; if fails tries the other side.
 * Returns { placedUnder: parentUserId, side } or null if cannot find (very unlikely).
 *
 * @param {String} rootUserId
 * @param {'left'|'right'|null} preferredSide
 * @param {String} childUserId
 * @param {Object} [session] optional mongoose session
 */
export async function findNearestFreeSlot(rootUserId, preferredSide = null, childUserId, session = null) {
  if (!rootUserId || !childUserId) throw new Error("rootUserId and childUserId required");

  // BFS queue
  const queue = [rootUserId];
  let idx = 0;

  while (idx < queue.length) {
    const currentId = queue[idx++];
    // attempt atomic reservation on preferred side first
    if (preferredSide === "left" || preferredSide === "right") {
      const ok = await trySetChildAtomically(currentId, preferredSide, childUserId, session);
      if (ok) return { placedUnder: currentId, side: preferredSide };
    } else {
      // no preference: check left then right
      const children = await getChildren(currentId);
      if (!children.left) {
        const okLeft = await trySetChildAtomically(currentId, "left", childUserId, session);
        if (okLeft) return { placedUnder: currentId, side: "left" };
      }
      if (!children.right) {
        const okRight = await trySetChildAtomically(currentId, "right", childUserId, session);
        if (okRight) return { placedUnder: currentId, side: "right" };
      }
    }

    // If preferred side was tried and failed (occupied by other concurrent op), try the other side
    if (preferredSide === "left" || preferredSide === "right") {
      const otherSide = preferredSide === "left" ? "right" : "left";
      const okOther = await trySetChildAtomically(currentId, otherSide, childUserId, session);
      if (okOther) return { placedUnder: currentId, side: otherSide };
    }

    // push children into queue to continue BFS
    const children = await getChildren(currentId);
    if (children.left) queue.push(children.left);
    if (children.right) queue.push(children.right);

    // Safety: protect against infinite loops by bounding queue length (very large networks)
    if (queue.length > 200000) {
      // extremely unlikely — break to avoid hang
      break;
    }
  }

  // If BFS exhausted without success, as a last resort try to find any node in DB with free slot using a single atomic op.
  // First try left slots:
  const leftCandidate = await User.findOneAndUpdate({ left: { $in: [null, undefined, ""] } }, { $set: { left: childUserId } }, { new: true, lean: true, session }).select("userId");
  if (leftCandidate) return { placedUnder: leftCandidate.userId, side: "left" };
  const rightCandidate = await User.findOneAndUpdate({ right: { $in: [null, undefined, ""] } }, { $set: { right: childUserId } }, { new: true, lean: true, session }).select("userId");
  if (rightCandidate) return { placedUnder: rightCandidate.userId, side: "right" };

  // no slot found
  return null;
}

/**
 * placeUser
 *
 * High-level function to place a new user into the binary tree following your rules:
 * - If placementId provided, attempt to place under that user.
 * - Else use sponsorId as the placement root.
 * - preferredSide optional: 'left'|'right' to prefer that side.
 * - Uses atomic updates to avoid race conditions. Accepts optional mongoose session for transaction safety.
 *
 * Returns:
 *  { success: true, placedUnder: 'GSM0001', side: 'left' }
 *  or { success: false, reason: '...' }
 *
 * Note: This function attempts to set the child's pointer on the parent. You should separately update
 * the new user's `placementId` and `sponsorId` fields in your user creation flow (or call this util after creating the user record).
 */
export async function placeUser({ newUserId, sponsorId, placementId = null, preferredSide = null, session = null }) {
  if (!newUserId) return { success: false, reason: "newUserId required" };
  // Determine root for placement
  let rootId = placementId || sponsorId;
  if (!rootId) {
    // As fallback, place under system root or first admin user; try to find a root user
    const rootUser = await User.findOne({}).select("userId").lean();
    if (!rootUser) return { success: false, reason: "No root user found to place under" };
    rootId = rootUser.userId;
  }

  // First attempt: try directly under requested root (preferred side first)
  if (preferredSide === "left" || preferredSide === "right") {
    const ok = await trySetChildAtomically(rootId, preferredSide, newUserId, session);
    if (ok) {
      return { success: true, placedUnder: rootId, side: preferredSide };
    }
    // try other side
    const otherSide = preferredSide === "left" ? "right" : "left";
    const okOther = await trySetChildAtomically(rootId, otherSide, newUserId, session);
    if (okOther) {
      return { success: true, placedUnder: rootId, side: otherSide };
    }
  } else {
    // no preference: try left then right on root
    const childrenRoot = await getChildren(rootId);
    if (!childrenRoot.left) {
      const okL = await trySetChildAtomically(rootId, "left", newUserId, session);
      if (okL) return { success: true, placedUnder: rootId, side: "left" };
    }
    if (!childrenRoot.right) {
      const okR = await trySetChildAtomically(rootId, "right", newUserId, session);
      if (okR) return { success: true, placedUnder: rootId, side: "right" };
    }
  }

  // If direct placement under requested root failed, run BFS to find nearest free slot under root
  const slot = await findNearestFreeSlot(rootId, preferredSide, newUserId, session);
  if (slot) {
    return { success: true, placedUnder: slot.placedUnder, side: slot.side };
  }

  // If BFS fails, return failure
  return { success: false, reason: "No free placement slot found" };
}

/**
 * OPTIONAL helper: placeNewUserAndSetDoc
 * Convenience function that:
 *  - creates/updates the User document's placementId field (and sponsorId if needed)
 *  - calls placeUser to find and set parent pointers
 *
 * WARNING: This helper performs both read/write operations; use transaction/session in production.
 *
 * Usage:
 *   await placeNewUserAndSetDoc({ newUserId: "GSM0009", sponsorId: "GSM0001", placementId: null, preferredSide: "left" });
 */
export async function placeNewUserAndSetDoc({ newUserId, sponsorId, placementId = null, preferredSide = null, session = null }) {
  if (!newUserId) throw new Error("newUserId required");
  // Try to use transaction session if provided
  let ownSession = null;
  let usedSession = session;
  try {
    if (!usedSession && mongoose.connection.readyState === 1) {
      // no session passed; not starting a transaction here by default.
      // If you want transaction safety, pass a session from caller.
    }

    // Find the user doc (assumes user is already created). If not, caller should create user first.
    const userDoc = await User.findOne({ userId: newUserId }).session(usedSession || null);
    if (!userDoc) throw new Error("new user document not found; create user before placing");

    // Place user in tree
    const placementResult = await placeUser({ newUserId, sponsorId, placementId, preferredSide, session: usedSession });

    if (!placementResult.success) {
      return { success: false, reason: placementResult.reason || "Placement failed" };
    }

    // Update user's placementId & sponsorId (if not set)
    userDoc.placementId = placementResult.placedUnder;
    if (!userDoc.sponsorId && sponsorId) userDoc.sponsorId = sponsorId;
    await userDoc.save({ session: usedSession || null });

    return { success: true, placedUnder: placementResult.placedUnder, side: placementResult.side };
  } catch (e) {
    // bubble up
    return { success: false, reason: e.message || "Error during placeNewUserAndSetDoc" };
  } finally {
    if (ownSession) {
      try { await ownSession.endSession(); } catch (ignore) {}
    }
  }
}

export default {
  placeUser,
  findNearestFreeSlot,
  placeNewUserAndSetDoc,
  getChildren,
};
