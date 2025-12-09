// utils/placement.js
import User from "../models/User.js";

export async function autoPlacementIfMissing(user) {
  if (user.placementId) return user;

  const sponsor = await User.findById(user.sponsorId);
  if (!sponsor) return user;

  // find weaker leg
  const leftCount = await User.countDocuments({ placementId: sponsor._id, placementSide: "left" });
  const rightCount = await User.countDocuments({ placementId: sponsor._id, placementSide: "right" });

  let side = leftCount <= rightCount ? "left" : "right";

  // assign placement
  user.placementId = sponsor._id;
  user.placementSide = side;

  return user;
}
