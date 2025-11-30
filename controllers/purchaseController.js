import Purchase from "../models/Purchase.js";
import User from "../models/User.js";
import Package from "../models/Package.js";
import EPIN from "../models/Epin.js";
import { creditPV_BV } from "../utils/pvEngine.js";
import { activateUserInGenealogy } from "../utils/genealogyEngine.js";


// -----------------------------------------
// Purchase New Package Using E-PIN
// -----------------------------------------
export const purchaseWithEpin = async (req, res) => {
  try {
    const { userId, epinCode } = req.body;

    const epin = await EPIN.findOne({ epinCode, isUsed: false });
    if (!epin) return res.status(400).json({ message: "Invalid or used E-PIN" });

    const user = await User.findById(userId);
    if (!user) return res.status(400).json({ message: "User not found" });

    const pkg = await Package.findById(epin.packageId);
    if (!pkg) return res.status(400).json({ message: "Package not found" });

    // Session auto-detection
    const hour = new Date().getHours();
    const session = hour >= 6 && hour <= 16 ? "morning" : "evening";

    const purchase = await Purchase.create({
      userId,
      packageId: pkg._id,
      packageName: pkg.packageName,
      amount: pkg.amount,
      pv: pkg.pv,
      bv: pkg.bv,
      prefix: pkg.prefix,
      paymentMethod: "epin",
      status: "success",
      activationDate: new Date(),
      session,
    });

    // Mark EPIN as used
    epin.isUsed = true;
    epin.usedBy = user._id;
    epin.usedDate = new Date();
    await epin.save();

    // Genealogy activation
    await activateUserInGenealogy(user._id);

    // PV/BV Credit System
    await creditPV_BV(user._id, pkg.pv, pkg.bv);

    return res.status(200).json({
      message: "Package activated successfully",
      purchase,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


// -----------------------------------------
// Admin Direct Activation (without epin)
// -----------------------------------------
export const adminActivatePackage = async (req, res) => {
  try {
    const { userId, packageId } = req.body;

    const user = await User.findById(userId);
    const pkg = await Package.findById(packageId);

    if (!user || !pkg)
      return res.status(404).json({ message: "User or Package not found" });

    const purchase = await Purchase.create({
      userId,
      packageId,
      packageName: pkg.packageName,
      amount: pkg.amount,
      pv: pkg.pv,
      bv: pkg.bv,
      prefix: pkg.prefix,
      paymentMethod: "admin",
      status: "success",
      activationDate: new Date(),
      session: "morning",
    });

    // Genealogy Activation
    await activateUserInGenealogy(user._id);

    // PV/BV Engine
    await creditPV_BV(user._id, pkg.pv, pkg.bv);

    return res.status(200).json({
      message: "Package activated by admin successfully",
      purchase,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// -----------------------------------------
// Get All Purchases (Admin)
// -----------------------------------------
export const getAllPurchases = async (req, res) => {
  try {
    const purchases = await Purchase.find()
      .populate("userId", "name email userId")
      .populate("packageId", "packageName amount");
    res.status(200).json(purchases);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

