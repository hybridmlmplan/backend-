const Wallet = require("../models/wallets");
const User = require("../models/User");

// ✔ Fetch wallet of logged in user
exports.getMyWallet = async (req, res) => {
  try {
    const userId = req.user.id;

    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    return res.json(wallet);
  } catch (error) {
    console.error("Error fetching wallet:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// ✔ Admin credit wallet
exports.adminCreditWallet = async (req, res) => {
  try {
    const { userId, amount, type, description } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    let wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      wallet = new Wallet({ userId, balance: 0, history: [] });
    }

    wallet.balance += amount;
    wallet.history.push({
      amount,
      type: type || "credit",
      description,
      date: new Date()
    });

    await wallet.save();

    return res.json({ message: "Wallet credited successfully", wallet });
  } catch (error) {
    console.error("Admin credit error:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// ✔ Admin debit wallet
exports.adminDebitWallet = async (req, res) => {
  try {
    const { userId, amount, description } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    if (wallet.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    wallet.balance -= amount;
    wallet.history.push({
      amount,
      type: "debit",
      description,
      date: new Date()
    });

    await wallet.save();

    return res.json({ message: "Wallet debited successfully", wallet });
  } catch (error) {
    console.error("Admin debit error:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};
