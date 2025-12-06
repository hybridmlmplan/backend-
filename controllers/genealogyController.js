// controllers/genealogyController.js

import User from "../models/User.js";

// ===================================================
// 1. DIRECT TEAM
// GET /api/genealogy/directs/:userId
// ===================================================
export const getDirectsByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const directs = await User.find({ sponsorId: userId })
      .select("userId name phone email sponsorId placementSide packageType joinedDate status");

    return res.json({
      status: true,
      total: directs.length,
      directs,
    });

  } catch (err) {
    console.error("getDirectsByUser Error", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};


// ===================================================
// 2. BINARY TREE NODE (one level)
// GET /api/genealogy/tree/:userId
// ===================================================
export const getTreeByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({ userId })
      .select("userId name email sponsorId parentId leftChild rightChild packageType");

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found"
      });
    }

    let left = null, right = null;

    if (user.leftChild) {
      left = await User.findOne({ userId: user.leftChild })
        .select("userId name email sponsorId parentId leftChild rightChild packageType");
    }

    if (user.rightChild) {
      right = await User.findOne({ userId: user.rightChild })
        .select("userId name email sponsorId parentId leftChild rightChild packageType");
    }

    return res.json({
      status: true,
      user,
      left,
      right
    });

  } catch (err) {
    console.error("getTreeByUser Error", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};


// ===================================================
// 3. PLACE USER IN BINARY TREE (ADMIN ONLY)
// POST /api/genealogy/place-user
// ===================================================
export const placeUserInTree = async (req, res) => {
  try {
    const { parentId, newUserId, position } = req.body;

    if (!parentId || !newUserId || !position) {
      return res.status(400).json({
        status: false,
        message: "parentId, newUserId, position are required"
      });
    }

    // find parent and child
    const parent = await User.findOne({ userId: parentId });
    const child = await User.findOne({ userId: newUserId });

    if (!parent || !child) {
      return res.status(404).json({
        status: false,
        message: "Parent or child not found"
      });
    }

    if (position === "left") {
      if (parent.leftChild)
        return res.status(400).json({
          status: false,
          message: "Left already occupied"
        });

      parent.leftChild = newUserId;
    }

    else if (position === "right") {
      if (parent.rightChild)
        return res.status(400).json({
          status: false,
          message: "Right already occupied"
        });

      parent.rightChild = newUserId;
    }

    else {
      return res.status(400).json({
        status: false,
        message: "position must be left or right"
      });
    }

    child.parentId = parentId;

    await parent.save();
    await child.save();

    return res.json({
      status: true,
      message: "User placed successfully",
      parentId,
      newUserId,
      position
    });

  } catch (err) {
    console.error("placeUserInTree Error", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};


// ===================================================
// 4. DOWNLINE (unlimited depth + optional level)
// GET /api/genealogy/downline/:userId/:level?
// ===================================================
export const getDownline = async (req, res) => {
  try {
    const { userId, level } = req.params;

    const user = await User.findOne({ userId }).select("userId");
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found"
      });
    }

    let result = [];
    let currentLevelUsers = [userId];
    let depth = 1;

    while (currentLevelUsers.length > 0) {

      const users = await User.find({
        parentId: { $in: currentLevelUsers }
      }).select("userId name email sponsorId parentId leftChild rightChild packageType");

      if (users.length === 0) break;

      result.push({
        level: depth,
        count: users.length,
        users
      });

      currentLevelUsers = users.map(u => u.userId);
      depth++;

      if (level && depth > parseInt(level)) break;
    }

    return res.json({
      status: true,
      userId,
      totalLevels: result.length,
      result
    });

  } catch (err) {
    console.error("getDownline Error", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};
