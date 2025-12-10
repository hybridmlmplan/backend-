// ============================================================
// FRANCHISE SERVICE (FINAL PLAN VERSION)
// ============================================================

import Franchise from "../models/Franchise.js";
import FranchiseOrder from "../models/FranchiseOrder.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import WalletLedger from "../models/WalletLedger.js";

// ------------------------------------------------------------
// Helper: Add money to wallet
// ------------------------------------------------------------
const addToWallet = async (userId, amount, type, note) => {
  await Wallet.findOneAndUpdate(
    { userId },
    { $inc: { balance: amount } },
    { new: true, upsert: true }
  );

  await WalletLedger.create({
    userId,
    amount,
    type,
    note,
    date: new Date(),
  });
};

// ------------------------------------------------------------
// Create Franchise Sale + BV Distribution
// ------------------------------------------------------------
export const processFranchiseSale = async ({
  franchiseId,
  buyerId,
  productId,
  productName,
  qty,
  price,
  bv,
  referrerId,
  franchisePercent, // min 5% (admin configurable)
}) => {
  try {
    const franchise = await Franchise.findById(franchiseId);
    if (!franchise) return { status: false, message: "Franchise not found" };

    // --------------------------------------------------------
    // 1️⃣ Franchise Stock Check
    // --------------------------------------------------------
    const stockItem = franchise.stock.find((x) => x.productId === productId);
    if (!stockItem || stockItem.qty < qty) {
      return { status: false, message: "Insufficient stock" };
    }

    // Deduct stock
    stockItem.qty -= qty;
    await franchise.save();

    // Total price and BV
    const totalPrice = price * qty;
    const totalBV = bv * qty;

    // --------------------------------------------------------
    // 2️⃣ Create Franchise Order Record
    // --------------------------------------------------------
    await FranchiseOrder.create({
      franchiseId,
      buyerId,
      productId,
      productName,
      qty,
      price,
      totalPrice,
      bv: totalBV,
      date: new Date(),
    });

    // --------------------------------------------------------
    // 3️⃣ Franchise Holder Income
    // --------------------------------------------------------
    const franchiseIncome = (totalPrice * franchisePercent) / 100;

    await addToWallet(
      franchise.ownerId,
      franchiseIncome,
      "franchise_income",
      `Franchise Sale Income (${franchisePercent}%)`
    );

    // --------------------------------------------------------
    // 4️⃣ Referrer Income (1% BV)
    // --------------------------------------------------------
    if (referrerId) {
      const refIncome = (totalBV * 1) / 100;

      await addToWallet(
        referrerId,
        refIncome,
        "referrer_income",
        `Franchise Referral Income (1% of BV)`
      );
    }

    // --------------------------------------------------------
    // 5️⃣ Return final response
    // --------------------------------------------------------
    return {
      status: true,
      message: "Franchise sale processed successfully",
      franchiseIncome,
      totalBV,
    };
  } catch (err) {
    console.error("Franchise Sale Error:", err);
    return { status: false, message: "Server error in franchise service" };
  }
};
