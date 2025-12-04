// controllers/genealogyController.js

import User from "../models/User.js";

/**
 * GET TREE NODE WITH CHILDREN
 * /api/genealogy/tree/:userId
 */
export const getTreeByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({ gsmId: userId })
      .select("gsmId fullName email sponsorId leftChild rightChild");

    if (!user) {
      return res.status(404).json({ message: "User not found in tree" });
    }

    let left = null;
    if (user.leftChild) {
      left = await User.findOne({ gsmId: user.leftChild })
        .select("gsmId fullName email sponsorId");
    }

    let right = null;
    if (user.rightChild) {
      right = await User.findOne({ gsmId: user.rightChild })
        .select("gsmId fullName email sponsorId");
    }

    res.json({
      user,
      left,
      right
    });

  } catch (err) {
    console.error("getTreeByUser Error", err);
    res.status(500).json({ message: "Server error" });
  }
};


/**
 * PLACE USER IN TREE (ADMIN ONLY)
 * /api/genealogy/place-user
 * body: { parentId, newUserId, position } // left/right
 */
export const placeUserInTree = async (req, res) => {
  try {
    const { parentId, newUserId, position } = req.body;

    if (!parentId || !newUserId || !position) {
      return res.status(400).json({ message: "parentId, newUserId, position required" });
    }

    const parent = await User.findOne({ gsmId: parentId });
    const child = await User.findOne({ gsmId: newUserId });

    if (!parent || !child) {
      return res.status(404).json({ message: "Parent or child user not found" });
    }

    if (position === "left") {
      if (parent.leftChild) {
        return res.status(400).json({ message: "Left position already occupied" });
      }
      parent.leftChild = newUserId;
    }

    else if (position === "right") {
      if (parent.rightChild) {
        return res.status(400).json({ message: "Right position already occupied" });
      }
      parent.rightChild = newUserId;
    }

    else {
      return res.status(400).json({ message: "Position must be left or right" });
    }

    child.parentId = parentId;

    await parent.save();
    await child.save();

    res.json({
      message: "User placed successfully",
      parentId,
      newUserId,
      position
    });

  } catch (err) {
    console.error("placeUserInTree Error", err);
    res.status(500).json({ message: "Server error" });
  }
};


/**
 * GET DOWNLINE MEMBERS UPTO X LEVEL
 * /api/genealogy/downline/:userId/:level?
 */
export const getDownline = async (req, res) => {
  try {
    const { userId, level = 3 } = req.params;

    const root = await User.findOne({ gsmId: userId });

    if (!root) {
      return res.status(404).json({ message: "User not found" });
    }

    // BFS traversal
    const queue = [{ id: root.gsmId, lvl: 0 }];
    const result = [];

    while (queue.length) {
      const { id, lvl } = queue.shift();

      if (lvl >= level) continue;

      const user = await User.findOne({ gsmId: id });

      if (!user) continue;

      if (user.leftChild) {
        result.push({
          parent: id,
          child: user.leftChild,
          position: "left",
          level: lvl + 1
        });
        queue.push({ id: user.leftChild, lvl: lvl + 1 });
      }

      if (user.rightChild) {
        result.push({
          parent: id,
          child: user.rightChild,
          position: "right",
          level: lvl + 1
        });
        queue.push({ id: user.rightChild, lvl: lvl + 1 });
      }
    }

    res.json({
      requestedUser: userId,
      levels: parseInt(level),
      downline: result
    });

  } catch (err) {
    console.error("getDownline Error", err);
    res.status(500).json({ message: "Server error" });
  }
};
