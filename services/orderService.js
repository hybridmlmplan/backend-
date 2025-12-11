// services/orderService.js
// -------------------------------------------------------
// PRODUCT / PACKAGE ORDER ENGINE
// Handles:
//  - Package Activation (PV based)
//  - Product/Repurchase Orders (BV based)
//  - EPIN verification
//  - BV Distribution (FundService)
//  - PV Distribution (BinaryService)
//  - Franchise Commission
//  - Stock deduction
// -------------------------------------------------------

const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const EPIN = require("../models/EPIN");
const BVLedger = require("../models/BVLedger");
const Franchise = require("../models/Franchise");

const fundService = require("./fundService");
const binaryService = require("./binaryService");


// ===========================================================
// 1) PACKAGE ACTIVATION (Silver / Gold / Ruby)
// ===========================================================
exports.activatePackage = async function (userId, pinCode) {
  try {
    const pin = await EPIN.findOne({ code: pinCode, isUsed: false });
    if (!pin) throw new Error("Invalid or used EPIN");

    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    // Package config
    const PACKAGE = {
      silver: { price: 35, pv: 35 },
      gold: { price: 155, pv: 155 },
      ruby: { price: 1250, pv: 1250 },
    };

    const pkg = PACKAGE[pin.package];
    if (!pkg) throw new Error("Invalid package");

    // Mark EPIN used
    pin.isUsed = true;
    pin.usedBy = userId;
    pin.usedDate = new Date();
    await pin.save();

    // Mark package active
    user.package = pin.package;
    user.pv += pkg.pv;
    user.isActive = true;
    await user.save();

    // PV → Binary Pair System
    await binaryService.addPV(userId, pkg.pv);

    return {
      status: true,
      message: `${pin.package} package activated`,
    };
  } catch (err) {
    return { status: false, error: err.message };
  }
};



// ===========================================================
// 2) PRODUCT ORDER (BV BASED)
// ===========================================================
exports.createOrder = async function (userId, items = []) {
  try {
    /*
      items = [
        { productId: "", qty: 2 }
      ]
    */

    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    let totalBV = 0;
    let totalPrice = 0;

    for (let i of items) {
      const product = await Product.findById(i.productId);
      if (!product) throw new Error("Invalid product");

      if (product.stock < i.qty)
        throw new Error(`Not enough stock for ${product.name}`);

      // Deduct stock
      product.stock -= i.qty;
      await product.save();

      totalBV += product.bv * i.qty;
      totalPrice += product.price * i.qty;

      // Franchise Holder Income
      await processFranchiseBV(userId, product.bv * i.qty);
    }

    // Create Order Record
    const order = await Order.create({
      userId,
      items,
      totalPrice,
      totalBV,
      status: "completed",
      date: new Date(),
    });

    // Add BV Ledger
    await BVLedger.create({
      userId,
      bv: totalBV,
      type: "purchase",
      date: new Date(),
    });

    // BV → Fund Service Distribution
    await fundService.processBVIncome(userId, totalBV, "repurchase");

    return {
      status: true,
      message: "Order successfully placed",
      order,
    };
  } catch (err) {
    return { status: false, error: err.message };
  }
};



// ===========================================================
// 3) AUTO FRANCHISE COMMISSION (%)
// ===========================================================
async function processFranchiseBV(userId, bvAmount) {
  try {
    const franchise = await Franchise.findOne({ userId });
    if (!franchise) return;

    const percent = franchise.percent >= 5 ? franchise.percent : 5;
    const commission = (bvAmount * percent) / 100;

    await Franchise.updateOne(
      { userId },
      { $inc: { earned: commission } }
    );
  } catch (err) {
    console.error("Franchise BV Error:", err);
  }
}



// ===========================================================
// 4) DIRECT PURCHASE (WITHOUT PV) — OPTIONAL
// ===========================================================
exports.directPurchase = async function (userId, amountBV) {
  try {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    await BVLedger.create({
      userId,
      bv: amountBV,
      type: "manual_purchase",
      date: new Date(),
    });

    await fundService.processBVIncome(userId, amountBV, "manual");

    return { status: true, message: "BV added successfully" };
  } catch (err) {
    return { status: false, error: err.message };
  }
};



// ===========================================================
// 5) PACKAGE REPURCHASE FOR BV ONLY (NO PV)
// ===========================================================
exports.repurchasePackage = async function (userId, packageName) {
  try {
    const PACKAGES = {
      silver: { price: 35, bv: 30 },
      gold: { price: 155, bv: 140 },
      ruby: { price: 1250, bv: 1100 },
    };

    const pkg = PACKAGES[packageName];
    if (!pkg) throw new Error("Invalid repurchase package");

    // BV added only
    await BVLedger.create({
      userId,
      bv: pkg.bv,
      type: "repurchase_package",
      date: new Date(),
    });

    await fundService.processBVIncome(userId, pkg.bv, "repurchase_package");

    return { status: true, message: "Repurchase successful" };
  } catch (err) {
    return { status: false, error: err.message };
  }
};
