import EPIN from "../models/epin.js";
import User from "../models/User.js";
import Package from "../models/Package.js";

// ==================================================
// 1) ADMIN GENERATE PIN (Single or Multiple)
// ==================================================
export const generateEPIN = async (req, res) => {
  try {
    const { quantity, packageType, adminId } = req.body;

    if (!quantity || !packageType)
      return res.status(400).json({ message: "Quantity & package type required" });

    let createdPins = [];

    for (let i = 0; i < quantity; i++) {
      const randomCode = Math.floor(100000 + Math.random() * 900000);
      const epinCode = `${packageType.toUpperCase().slice(0, 1)}P-${randomCode}`;

      const newPin = await EPIN.create({
        epinCode,
        packageType,
        generatedBy: adminId || "admin",
      });

      createdPins.push(newPin);
    }

    return res.status(200).json({
      message: "EPIN Generated Successfully",
      pins: createdPins,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to generate EPIN", error });
  }
};

// ==================================================
// 2) EPIN TRANSFER (User to User)
// ==================================================
export const transferEPIN = async (req, res) => {
  try {
    const { epinCode, fromUserId, toUserId } = req.body;

    const pin = await EPIN.findOne({ epinCode });
    if (!pin) return res.status(404).json({ message: "EPIN not found" });

    if (pin.isUsed)
      return res.status(400).json({ message: "EPIN already used" });

    // Assign to new user
    pin.assignedTo = toUserId;
    pin.transferHistory.push({
      from: fromUserId,
      to: toUserId,
    });

    await pin.save();

    return res.status(200).json({
      message: "EPIN transferred successfully",
      pin,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to transfer EPIN", error });
  }
};

// ==================================================
// 3) GET ALL EPINS (Admin Panel)
// ==================================================
export const getAllEPINs = async (req, res) => {
  try {
    const pins = await EPIN.find().sort({ createdAt: -1 });
    return res.status(200).json(pins);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch EPINs", error });
  }
};

// ==================================================
// 4) GET PIN DETAILS (User + Admin)
// ==================================================
export const getEPINDetails = async (req, res) => {
  try {
    const { epinCode } = req.params;

    const pin = await EPIN.findOne({ epinCode });
    if (!pin) return res.status(404).json({ message: "EPIN not found" });

    return res.status(200).json(pin);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch EPIN details", error });
  }
};

// ==================================================
// 5) USE PIN → ACTIVATE PACKAGE
// ==================================================
export const useEPIN = async (req, res) => {
  try {
    const { epinCode, userId } = req.body;

    const pin = await EPIN.findOne({ epinCode });
    if (!pin) return res.status(404).json({ message: "EPIN not found" });

    if (pin.isUsed)
      return res.status(400).json({ message: "EPIN already used" });

    if (pin.assignedTo !== userId)
      return res.status(400).json({ message: "EPIN not assigned to this user" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // ********* PACKAGE ACTIVATION LOGIC *********

    let pv = 0;
    let bv = 0;

    if (pin.packageType === "silver") pv = 35;
    if (pin.packageType === "gold") pv = 155;
    if (pin.packageType === "ruby") pv = 1250;

    // Update user
    user.currentPackage = pin.packageType;
    user.status = "active";

    user.packageHistory.push({
      packageName: pin.packageType,
      pv,
      amount: 0,
      activationDate: new Date(),
    });

    // PV add (renewal follow-up rules handled later)
    user.pv += pv;

    await user.save();

    // Mark EPIN as used
    pin.isUsed = true;
    pin.usedBy = userId;
    pin.usedDate = new Date();
    await pin.save();

    return res.status(200).json({
      message: "Package activated successfully",
      user,
      pin,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to activate EPIN",
      error,
    });
  }
};
