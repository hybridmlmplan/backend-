import Purchase from "../models/Purchase.js";
import User from "../models/User.js";
import Package from "../models/Package.js";
import EPIN from "../models/Epin.js";
import PVHistory from "../models/PVHistory.js";
import { getNextGsmId } from "../services/getNextGsmId.js";
import { generatePairsFromUser, getCurrentSessionNumber } from "../utils/pairEngine.js";
import { placeUserInTree } from "../utils/genealogyEngine.js";

/**
 * Helpers
 */
const is29Feb = (date = new Date()) => {
  // month is 0-indexed: Feb = 1, day 29
  return date.getDate() === 29 && date.getMonth() === 1;
};

const detectSessionString = () => {
  const hour = new Date().getHours();
  // GT70: Session 1 -> 06:00–16:00 ; Session 2 -> 16:01–23:59
  if (hour >= 6 && hour <= 16) return "morning";
  return "evening";
};

// -----------------------------------------
// Purchase New Package Using E-PIN
// -----------------------------------------
export const purchaseWithEpin = async (req, res) => {
  try {
    // 29 Feb block
    if (is29Feb()) {
      return res.status(403).json({ status: false, message: "29 February: No registrations or activations allowed." });
    }

    const { userId, epinCode } = req.body;
    if (!userId || !epinCode) return res.status(400).json({ status: false, message: "userId and epinCode required" });

    const epin = await EPIN.findOne({ epinCode });
    if (!epin) return res.status(404).json({ status: false, message: "EPIN not found" });

    if (epin.isUsed) return res.status(400).json({ status: false, message: "EPIN already used" });

    // If EPIN is assignedTo someone, only that user can use it
    if (epin.assignedTo && epin.assignedTo.toString() !== userId.toString()) {
      return res.status(403).json({ status: false, message: "EPIN not assigned to this user" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ status: false, message: "User not found" });

    // Find package by packageName stored in EPIN (GT70 epin model uses packageType)
    const pkg = await Package.findOne({ packageName: epin.packageType || epin.packageName || epin.packageType });
    if (!pkg) return res.status(404).json({ status: false, message: "Package not found for this EPIN" });

    // Session detection (string) and numeric session for pairEngine
    const sessionString = detectSessionString();
    const sessionNumber = getCurrentSessionNumber ? getCurrentSessionNumber() : (sessionString === "morning" ? 1 : 2);

    // If user has no GSM userId yet, generate one using package prefix (GT70)
    if (!user.userId || user.userId.trim() === "") {
      const nextGsm = await getNextGsmId(pkg.prefix); // returns like "SP0001"
      user.userId = nextGsm;
    }

    // Activation date must respect Silver-join-date rule:
    // If this is Silver activation and renewalDate not set, set renewalDate to activation date.
    const activationDate = new Date();

    // Update user package & status
    // IMPORTANT (GT70): activation credits PV only (pair income depends on PV matching)
    user.currentPackage = pkg.packageName;
    user.status = "active";
    if (!user.joinedDate) user.joinedDate = activationDate;

    // If package is silver and renewalDate not set, set it to Silver activation date
    if (pkg.packageName === "silver" && !user.renewalDate) {
      user.renewalDate = activationDate;
    }
    // If user already had Silver renewalDate, do NOT overwrite it for Gold/Ruby upgrades

    // Add PV to user (activation PV). Do NOT treat BV as pair income.
    user.pv = (user.pv || 0) + pkg.pv;

    // Persist user changes before pair generation
    await user.save();

    // Record PVHistory
    try {
      await PVHistory.create({
        userId: user._id,
        type: "activation",
        amount: pkg.pv,
        packageName: pkg.packageName,
        date: activationDate,
      });
    } catch (e) {
      // Non-fatal: log and continue
      console.error("PVHistory create failed:", e.message);
    }

    // Mark EPIN used & link to purchase
    epin.isUsed = true;
    epin.usedBy = user._id;
    epin.usedDate = activationDate;
    await epin.save();

    // Create purchase record
    const purchase = await Purchase.create({
      userId: user._id,
      packageId: pkg._id,
      packageName: pkg.packageName,
      amount: pkg.amount,
      pv: pkg.pv,
      bv: pkg.bv, // stored for record only; BV is not used for pair income
      prefix: pkg.prefix,
      paymentMethod: "epin",
      status: "success",
      activationDate,
      session: sessionString,
    });

    // If user is not placed in genealogy (first real activation), run placement
    // GT70: activateUserInGenealogy should handle sponsor/placement and placeUserInTree
    // We use placeUserInTree if needed (activateUserInGenealogy wrapper might call it)
    try {
      await placeUserInTree(user._id, user.sponsorId, user.placementSide);
    } catch (e) {
      // it's okay if placement logic is handled elsewhere
      console.info("placeUserInTree warning:", e.message);
    }

    // Trigger pair generation UP the tree (PV-based pairing)
    try {
      await generatePairsFromUser(user._id);
    } catch (e) {
      console.error("Pair generation failed:", e.message);
    }

    return res.status(200).json({
      status: true,
      message: "Package activated successfully",
      data: {
        purchase,
        userId: user._id,
        userGsm: user.userId,
      },
    });
  } catch (err) {
    console.error("purchaseWithEpin error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};


// -----------------------------------------
// Admin Direct Activation (without epin)
// -----------------------------------------
export const adminActivatePackage = async (req, res) => {
  try {
    // 29 Feb block
    if (is29Feb()) {
      return res.status(403).json({ status: false, message: "29 February: No activations allowed." });
    }

    const { userId, packageId } = req.body;
    if (!userId || !packageId) return res.status(400).json({ status: false, message: "userId and packageId required" });

    const user = await User.findById(userId);
    const pkg = await Package.findById(packageId);

    if (!user || !pkg) return res.status(404).json({ status: false, message: "User or Package not found" });

    const activationDate = new Date();
    const sessionString = detectSessionString();

    // Generate userId if missing
    if (!user.userId || user.userId.trim() === "") {
      const nextGsm = await getNextGsmId(pkg.prefix);
      user.userId = nextGsm;
    }

    // Update user fields (PV only)
    user.currentPackage = pkg.packageName;
    user.status = "active";
    if (!user.joinedDate) user.joinedDate = activationDate;
    if (pkg.packageName === "silver" && !user.renewalDate) user.renewalDate = activationDate;

    user.pv = (user.pv || 0) + pkg.pv;
    await user.save();

    // PVHistory
    try {
      await PVHistory.create({
        userId: user._id,
        type: "activation",
        amount: pkg.pv,
        packageName: pkg.packageName,
        date: activationDate,
      });
    } catch (e) {
      console.error("PVHistory create failed:", e.message);
    }

    // Purchase record
    const purchase = await Purchase.create({
      userId: user._id,
      packageId: pkg._id,
      packageName: pkg.packageName,
      amount: pkg.amount,
      pv: pkg.pv,
      bv: pkg.bv,
      prefix: pkg.prefix,
      paymentMethod: "admin",
      status: "success",
      activationDate,
      session: sessionString,
    });

    // Place in genealogy if required
    try {
      await placeUserInTree(user._id, user.sponsorId, user.placementSide);
    } catch (e) {
      console.info("placeUserInTree warning:", e.message);
    }

    // Trigger PV-based pair generation
    try {
      await generatePairsFromUser(user._id);
    } catch (e) {
      console.error("Pair generation failed:", e.message);
    }

    return res.status(200).json({
      status: true,
      message: "Package activated by admin successfully",
      data: { purchase, userId: user._id, userGsm: user.userId },
    });
  } catch (err) {
    console.error("adminActivatePackage error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
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
    return res.status(200).json({ status: true, data: purchases });
  } catch (err) {
    console.error("getAllPurchases error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};
