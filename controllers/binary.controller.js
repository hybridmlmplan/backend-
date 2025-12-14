import User from "../models/User.js";
import PVLedger from "../models/PVLedger.js";
import { placeUser } from "../utils/tree.js";

export const activateBinary = async (req, res) => {
  const { userId, pv } = req.body;

  const user = await User.findOne({ userId });
  if (!user || !user.isActive)
    return res.status(400).json({ message: "Inactive user" });

  let currentId = user.placementId;

  while (currentId) {
    const parent = await User.findOne({ userId: currentId });
    if (!parent) break;

    if (user.placementSide === "LEFT") parent.pvLeft += pv;
    else parent.pvRight += pv;

    await parent.save();

    await PVLedger.create({
      userId: parent.userId,
      fromUser: userId,
      side: user.placementSide,
      pv,
      remark: "PV added from downline"
    });

    currentId = parent.placementId;
  }

  await placeUser(user.placementId, userId, user.placementSide);

  res.json({ message: "Binary PV placed successfully" });
};
