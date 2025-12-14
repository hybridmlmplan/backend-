import BinaryNode from "../models/BinaryNode.js";

export const placeUser = async (parentId, userId, side) => {
  const parent = await BinaryNode.findOne({ userId: parentId });

  if (!parent) {
    await BinaryNode.create({ userId });
    return;
  }

  if (side === "LEFT") {
    if (!parent.left) {
      parent.left = userId;
      await parent.save();
    } else {
      return placeUser(parent.left, userId, "LEFT");
    }
  }

  if (side === "RIGHT") {
    if (!parent.right) {
      parent.right = userId;
      await parent.save();
    } else {
      return placeUser(parent.right, userId, "RIGHT");
    }
  }

  await BinaryNode.create({ userId, parentId });
};
