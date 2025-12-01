const Tree = require('../models/Tree');
const User = require('../models/User');
const mongoose = require('mongoose');

/**
 * getTreeByUser - returns a tree node and its nearby children
 */
exports.getTreeByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const node = await Tree.findOne({ user: userId }).populate('left right parent', 'user fullName email');
    if (!node) return res.status(404).json({ message: 'Tree node not found' });
    res.json({ node });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * placeUserInTree - admin places a user into the binary tree
 * body: { userId, parentId, position } // position: 'left' | 'right'
 */
exports.placeUserInTree = async (req, res) => {
  try {
    const { userId, parentId, position } = req.body;
    if (!['left','right'].includes(position)) return res.status(400).json({ message: 'Invalid position' });

    // check parent node
    const parentNode = await Tree.findOne({ user: parentId });
    if (!parentNode) return res.status(404).json({ message: 'Parent node not found' });

    // ensure slot is empty
    if (parentNode[position]) return res.status(400).json({ message: `${position} slot is already filled` });

    // create node for user
    const depth = parentNode.depth + 1;
    const newNode = await Tree.create({
      user: userId,
      parent: parentNode.user,
      position,
      depth
    });

    // update parent slot
    parentNode[position] = mongoose.Types.ObjectId(userId);
    await parentNode.save();

    res.json({ success: true, newNode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * getDownline - fetch downline up to given level (default level 1)
 */
exports.getDownline = async (req, res) => {
  try {
    const { userId } = req.params;
    const level = parseInt(req.params.level || '1', 10);

    // BFS down the tree
    const root = await Tree.findOne({ user: userId });
    if (!root) return res.status(404).json({ message: 'Root node not found' });

    let queue = [{ node: root, depth: 0 }];
    const results = [];

    while (queue.length) {
      const { node, depth } = queue.shift();
      if (depth > 0) {
        const user = await User.findById(node.user).select('fullName email');
        results.push({ user, depth });
      }
      if (depth >= level) continue;

      if (node.left) {
        const leftNode = await Tree.findOne({ user: node.left });
        if (leftNode) queue.push({ node: leftNode, depth: depth + 1 });
      }
      if (node.right) {
        const rightNode = await Tree.findOne({ user: node.right });
        if (rightNode) queue.push({ node: rightNode, depth: depth + 1 });
      }
    }

    res.json({ root: root.user, downline: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
