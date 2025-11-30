import User from "../models/User.js";

// ----------------------------------------------------
// FIND PLACEMENT — AUTO LEFT/RIGHT FILL
// ----------------------------------------------------
export const findPlacement = async (sponsorId, side) => {
  // If sponsor has empty side → direct place
  const sponsor = await User.findById(sponsorId);
  if (!sponsor) return null;

  if (side === "left" && sponsor.leftChild == null) return sponsorId;
  if (side === "right" && sponsor.rightChild == null) return sponsorId;

  // Otherwise BFS search in that side subtree
  let queue = [sponsorId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    const current = await User.findById(currentId);

    if (side === "left") {
      if (!current.leftChild) return currentId;
      queue.push(current.leftChild);
    }

    if (side === "right") {
      if (!current.rightChild) return currentId;
      queue.push(current.rightChild);
    }
  }

  return null;
};

// ----------------------------------------------------
// ATTACH USER TO TREE (PLACEMENT)
// ----------------------------------------------------
export const placeUserInTree = async (
  newUserId,
  sponsorId,
  placementSide
) => {
  const parentId = await findPlacement(sponsorId, placementSide);
  if (!parentId) return false;

  const parent = await User.findById(parentId);
  const newUser = await User.findById(newUserId);

  if (placementSide === "left") parent.leftChild = newUserId;
  else parent.rightChild = newUserId;

  // TREE RELATION
  newUser.treeParent = parentId;
  parent.treeChildren.push(newUserId);

  await parent.save();
  await newUser.save();

  // Update left/right team count
  await updateTeamCounts(parentId, placementSide);

  return true;
};

// ----------------------------------------------------
// UPDATE TEAM COUNTS (PV CARRY SIDE)
// ----------------------------------------------------
const updateTeamCounts = async (parentId, side) => {
  let current = parentId;

  while (current) {
    const user = await User.findById(current);
    if (!user) break;

    if (side === "left") user.leftTeam += 1;
    if (side === "right") user.rightTeam += 1;

    await user.save();

    current = user.treeParent;
  }
};

// ----------------------------------------------------
// PAIR MATCH ENGINE (GT70 Pair Rules)
// ----------------------------------------------------
export const checkAndCreatePair = async (userId) => {
  let current = userId;

  while (current) {
    const user = await User.findById(current);
    if (!user) break;

    // Agar dono side PV hai → 1 pair
    if (user.leftPV >= user.pairPV && user.rightPV >= user.pairPV) {
      user.leftPV -= user.pairPV;
      user.rightPV -= user.pairPV;

      user.pairCount += 1;

      await user.save();
    }

    current = user.treeParent;
  }
};
