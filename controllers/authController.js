import User from "../models/User.js";
import bcrypt from "bcryptjs";

// =========================
// SIGNUP (FULL MLM ACCOUNT)
// =========================
export const signup = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      sponsorId,
      placementId,
      placementSide,
      packageName, // silver/gold/ruby
    } = req.body;

    // Basic validation
    if (!name || !email || !phone || !password)
      return res.status(400).json({ status: false, message: "All fields required" });

    if (!sponsorId || !placementId || !placementSide || !packageName)
      return res.status(400).json({
        status: false,
        message: "Sponsor, Placement, Side & Package are required",
      });

    if (!["left", "right"].includes(placementSide.toLowerCase()))
      return res.status(400).json({ status: false, message: "Invalid placement side" });

    if (!["silver", "gold", "ruby"].includes(packageName.toLowerCase()))
      return res.status(400).json({ status: false, message: "Invalid package" });

    // Check duplicate user
    const userExist = await User.findOne({
      $or: [{ email }, { phone }],
    });

    if (userExist)
      return res.status(400).json({
        status: false,
        message: "Email or Phone already exists",
      });

    // Check sponsor existence
    const sponsor = await User.findOne({ userId: sponsorId });
    if (!sponsor)
      return res.status(400).json({
        status: false,
        message: "Sponsor ID not found",
      });

    // Check placement existence
    const placement = await User.findOne({ userId: placementId });
    if (!placement)
      return res.status(400).json({
        status: false,
        message: "Placement ID not found",
      });

    // Create hashed password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create unique userId prefix
    const prefix =
      packageName.toLowerCase() === "silver"
        ? "SP"
        : packageName.toLowerCase() === "gold"
        ? "GP"
        : "RP";

    const count = await User.countDocuments({});
    const userId = `${prefix}${String(count + 1).padStart(4, "0")}`;

    // Create new user
    const newUser = await User.create({
      userId,
      name,
      email,
      phone,
      password: hashedPassword,

      sponsorId,
      referralId: sponsorId,

      treeParent: placementId,
      placementSide: placementSide.toLowerCase(),

      joinedDate: new Date(),
      session: 1,
      renewalDate: new Date(),

      currentPackage: packageName.toLowerCase(),
      status: "inactive",
      kycStatus: "not-submitted",
    });

    // Add user to placement node
    placement.treeChildren.push({
      userId: newUser.userId,
      placementSide: placementSide.toLowerCase(),
      joinedDate: new Date(),
    });

    await placement.save();

    // Return response
    return res.status(200).json({
      status: true,
      message: "Signup successful",
      userId: newUser.userId,
      sponsorId: newUser.sponsorId,
      placementId: newUser.treeParent,
      placementSide: newUser.placementSide,
      package: newUser.currentPackage,
    });
  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Signup failed",
      error: err.message,
    });
  }
};
