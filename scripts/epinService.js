// backend/scripts/epinService.js
// EPIN generation, transfer, activation helpers
// Usage: await generateEPINs(count, generatedBy), await transferEPIN(epinCode, fromUserId, toUserId)

import EPIN from "../models/EPIN.js";
import User from "../models/User.js";
import { v4 as uuidv4 } from "uuid";

export async function generateEPINs(count = 1, generatedBy = null) {
  const created = [];
  for (let i = 0; i < count; i++) {
    const code = "EPIN" + uuidv4().replace(/-/g, "").slice(0, 10).toUpperCase();
    const doc = await EPIN.create({ code, status: "unused", createdBy: generatedBy, createdAt: new Date() });
    created.push(doc);
  }
  return created;
}

export async function transferEPIN(epinCode, fromUserId, toUserId) {
  const ep = await EPIN.findOne({ code: epinCode });
  if (!ep) throw new Error("EPIN not found");
  if (ep.status === "used") throw new Error("EPIN already used");
  // allow transfer
  ep.owner = toUserId;
  ep.transferredFrom = fromUserId;
  ep.transferredAt = new Date();
  await ep.save();
  return ep;
}

export async function activateEPIN(epinCode, userId) {
  const ep = await EPIN.findOne({ code: epinCode });
  if (!ep) throw new Error("EPIN not found");
  if (ep.status === "used") throw new Error("EPIN already used");
  ep.status = "used";
  ep.owner = userId;
  ep.usedAt = new Date();
  await ep.save();
  // Apply package activation – backend order flow should use orderService.processOrder
  return ep;
}

export default { generateEPINs, transferEPIN, activateEPIN };
