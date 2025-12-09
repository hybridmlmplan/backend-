// controllers/levelController.js
import LevelIncome from "../models/LevelIncome.js";

export const getLevelIncome = async (req, res) => {
  try {
    const userId = req.params.userId;
    const data = await LevelIncome.find({ userId }).sort({ createdAt: -1 });

    res.json({ status: true, data });
  } catch (err) {
    res.json({ status: false, message: err.message });
  }
};
