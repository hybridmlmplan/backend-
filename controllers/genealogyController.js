// controllers/genealogyController.js

import User from "../models/User.js";

/**
 * DIRECT TEAM LIST
 * GET /api/genealogy/directs/:userId
 */
export const getDirectsByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // get all users whose sponsorId = userId
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


/**
 * GET BINARY TREE NODE
 * GET /api/genealogy/tree/:userId
 */
export const getTreeByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({ userId })
      .select("userId name email sponsorId leftChild rightChild");

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found in tree"
      });
    }

    let left = null;
    if (user.leftChild) {
      left = await User.findOne({ userId: user.leftChild })
        .select("userId name email sponsorId");
    }

    let right = null;
    if (user.rightChild) {
      right = await User.findOne({ userId: user.rightChild })
        .select("userId name email sponsorId");
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


/**
 * PLACE USER IN TREE (ADMIN ONLY)
 * POST /api/genealogy/place-user
 */
export const placeUserInTree = async (req, res) => {
  try {
    const { parentId, newUserId, position } = req.body;

    if (!parentId || !newUserId || !position) {
      return res.status(400).json({
        status: false,
        message: "parentId, newUserId, position required"
      });
    }

    const parent = await User.findOne({ userId: parentId });
    const child = await User.findOne({ userId: newUserId });

    if (!parent || !child) {
      return res.status(404).json({
        status: false,
        message: "Parent or child user not found"
      });
    }

    if (position === "left") {
      if (parent.leftChild) {
        return res.status(400).json({
          status: false,
          message: "Left position already occupied"
        });
      }
      parent.leftChild = newUserId;
    }

    else if (position === "right") {
      if (parent.rightChild) {
        return res.status(400).json({
          status: false,
          message: "Right position already occupied"
        });
      }
      parent.rightChild = newUserId;
    }

    else {
      return res.status(400).json({
        status: false,
        message: "Position must be left or right"
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


/**
 * DOWNLINE MEMBERS
 * GET /api/genealogy/downline/:user
