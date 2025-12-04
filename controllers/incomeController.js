import BVHistory from "../models/BVHistory.js";

// ======================
// 1) DIRECT INCOME
// ======================
export const getDirectIncome = async (req, res) => {
  try {
    const userId = req.params.userId;

    const entries = await BVHistory.find({
      user: userId,
      type: "direct",
    }).sort({ createdAt: -1 });

    const total = entries.reduce((sum, i) => sum + (i.amount || 0), 0);

    return res.json({ total, entries });
  } catch (err) {
    console.error("Direct Income Error:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};

// ======================
// 2) LEVEL INCOME
// ======================
export const getLevelIncome = async (req, res) => {
  try {
    const userId = req.params.userId;

    const entries = await BVHistory.find({
      user: userId,
      type: "level",
    }).sort({ createdAt: -1 });

    const total = entries.reduce((sum, i) => sum + (i.amount || 0), 0);

    return res.json({ total, entries });
  } catch (err) {
    console.error("Level Income Error:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};

// ======================
// 3) BINARY INCOME
// ======================
export const getBinaryIncome = async (req, res) => {
  try {
    const userId = req.params.userId;

    const entries = await BVHistory.find({
      user: userId,
      type: "binary",
    }).sort({ createdAt: -1 });

    const total = entries.reduce((sum, i) => sum + (i.amount || 0), 0);

    return res.json({ total, entries });
  } catch (err) {
    console.error("Binary Income Error:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};

// ======================
// 4) MATCHING INCOME
// ======================
export const getMatchingIncome = async (req, res) => {
  try {
    const userId = req.params.userId;

    const entries = await BVHistory.find({
      user: userId,
      type: "matching",
    }).sort({ createdAt: -1 });

    const total = entries.reduce((sum, i) => sum + (i.amount || 0), 0);

    return res.json({ total, entries });
  } catch (err) {
    console.error("Matching Income Error:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};

// ======================
// 5) ROYALTY INCOME
// ======================
export const getRoyaltyIncome = async (req, res) => {
  try {
    const userId = req.params.userId;

    const entries = await BVHistory.find({
      user: userId,
      type: "royalty",
    }).sort({ createdAt: -1 });

    const total = entries.reduce((sum, i) => sum + (i.amount || 0), 0);

    return res.json({ total, entries });
  } catch (err) {
    console.error("Royalty Income Error:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};

// ======================
// 6) FUND INCOME / REPURCHASE
// ======================
export const getFundIncome = async (req, res) => {
  try {
    const userId = req.params.userId;

    const entries = await BVHistory.find({
      user: userId,
      type: "fund",
    }).sort({ createdAt: -1 });

    const total = entries.reduce((sum, i) => sum + (i.amount || 0), 0);

    return res.json({ total, entries });
  } catch (err) {
    console.error("Fund Income Error:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};
