// =======================================================================
// FRANCHISE CONTROLLER – FINAL VERSION (HYBRID MLM PLAN)
// =======================================================================

import Franchise from "../models/Franchise.js";
import Product from "../models/Product.js";
import FranchiseSale from "../models/FranchiseSale.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";

// Utility: Add BV to user wallet (Referrer 1%)
const addReferrerBVIncome = async (userId, bv) => {
  if (!userId || bv <= 0) return;

  await Wallet.findOneAndUpdate(
    { userId },
    {
      $inc: {
        bvIncome: bv * 0.01, // 1% BV income
        mainBalance: bv * 0.01,
      },
    },
    { upsert: true, new: true }
  );
};

// Utility: Add Franchise holder income (min 5%)
const addFranchiseHolderIncome = async (franchiseId, amount) => {
  const franchise = await Franchise.findById(franchiseId);
  if (!franchise) return;

  const commission = (franchise.commissionPercent || 5) / 100;
  const income = amount * commission;

  await Wallet.findOneAndUpdate(
    { userId: franchise.userId },
    {
      $inc: {
        franchiseIncome: income,
        mainBalance: income,
      },
    },
    { upsert: true, new: true }
  );
};

// =======================================================================
// CREATE FRANCHISE (Admin)
// =======================================================================
export const createFranchise = async (req, res) => {
  try {
    const { name, userId, commissionPercent } = req.body;

    const franchiseId = "FGSM" + (Math.floor(1000 + Math.random() * 9000));

    const franchise = new Franchise({
      franchiseId,
      name,
      userId,
      commissionPercent: commissionPercent || 5,
    });

    await franchise.save();

    return res.status(200).json({
      status: true,
      message: "Franchise created successfully",
      data: franchise,
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: err.message });
  }
};

// =======================================================================
// ADD PRODUCT (Admin)
// =======================================================================
export const addProduct = async (req, res) => {
  try {
    const {
      category,
      name,
      price,
      bv,
      pv,
      franchiseCommissionPercent,
      stockManagedByFranchise,
    } = req.body;

    const productId = "PROD" + Math.floor(100000 + Math.random() * 900000);

    const product = new Product({
      productId,
      category,
      name,
      price,
      bv,
      pv,
      franchiseCommissionPercent,
      stockManagedByFranchise: stockManagedByFranchise || false,
    });

    await product.save();

    return res.status(200).json({
      status: true,
      message: "Product added successfully",
      data: product,
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: err.message });
  }
};

// =======================================================================
// RECORD SALE (Franchise Panel)
// =======================================================================
export const recordSale = async (req, res) => {
  try {
    const {
      franchiseId,
      productId,
      quantity,
      buyerUserId,
      referrerUserId,
    } = req.body;

    const franchise = await Franchise.findOne({ franchiseId });
    if (!franchise)
      return res.status(400).json({ status: false, message: "Invalid franchise" });

    const product = await Product.findOne({ productId });
    if (!product)
      return res.status(400).json({ status: false, message: "Invalid product" });

    const totalAmount = product.price * quantity;

    const totalBV = product.bv * quantity;
    const totalPV = product.pv * quantity;

    // Generate sale ID
    const saleId = "SALE" + Math.floor(100000 + Math.random() * 900000);

    // Save sale record
    const sale = new FranchiseSale({
      saleId,
      franchiseId,
      productId,
      quantity,
      buyerUserId,
      referrerUserId,
      totalAmount,
      totalBV,
      totalPV,
      date: new Date(),
    });

    await sale.save();

    // ---------------------- Wallet Processing ----------------------- //

    // 1% BV → Referrer Income
    if (referrerUserId) {
      await addReferrerBVIncome(referrerUserId, totalBV);
    }

    // Franchise Commission → 5% or product override
    const franchiseCommission =
      product.franchiseCommissionPercent ||
      franchise.commissionPercent ||
      5;

    const franchiseIncome = (totalAmount * franchiseCommission) / 100;

    await Wallet.findOneAndUpdate(
      { userId: franchise.userId },
      {
        $inc: {
          franchiseIncome: franchiseIncome,
          mainBalance: franchiseIncome,
        },
      },
      { new: true, upsert: true }
    );

    // ---------------------------------------------------------------- //

    return res.status(200).json({
      status: true,
      message: "Sale recorded successfully",
      sale,
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: err.message });
  }
};

// =======================================================================
// GET ALL FRANCHISE SALES
// =======================================================================
export const getFranchiseSales = async (req, res) => {
  try {
    const { franchiseId } = req.params;

    const sales = await FranchiseSale.find({ franchiseId }).sort({ date: -1 });

    return res.status(200).json({
      status: true,
      message: "Sales fetched",
      data: sales,
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: err.message });
  }
};

// =======================================================================
// GET ALL PRODUCTS
// =======================================================================
export const getProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });

    return res.status(200).json({
      status: true,
      data: products,
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: err.message });
  }
};
