import User from "../models/User.js";
import bcrypt from "bcryptjs";
import { generateUserId } from "../utils/generateUserId.js";

// ======================================================
// SIGNUP CONTROLLER
// ======================================================
export const signup = async (req, res) => {
  try {
    const {
      name,
      phone,
      password,
      sponsorId,
      placementId,
      placementSide,
      packageType,
      email,
    } = req.body;

    // Basic validation
    if (!name || !phone || !password) {
      return res.status(400).json({
        status: false,
        message: "Name, phone & password are required",
      });
    }

    if (!sponsorId) {
      return res.status(400).json({
        status: false,
        message: "Sponsor ID is required",
      });
    }

    // Phone already exists?
    const phoneExists = await User.findOne({ phone });
    if (phoneExists) {
      return res.status(400).json({
        status: false,
        message: "Phone already registered",
      });
    }

    // Sponsor valid?
    const sponsor = await User.findOne({ userId: sponsorId });
    if (!sponsor) {
      return res.status(400).json({
        status: false,
        message: "Invalid sponsor ID",
      });
    }

    // Placement check if provided
    if (placementId) {
      const placement = await User.findOne({ userId: placementId });
      if (!placement) {
        return res.status(400).json({
          status: false,
          message: "Invalid placement ID",
        });
      }
    }

    // Hash password
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    // Generate user ID
    const userId = await generateUserId();

    const finalPackage =
      (packageType || "silver").toString().trim().toLowerCase();

    // Create user
    await User.create({
      userId,
      name,
      phone,
      email: email || null,
      password: hashedPassword,
      sponsorId,
      placementId: placementId || null,
      placementSide: placementSide || null,
      packageType: finalPackage,

      session: 1,
      joinedDate: new Date(),
      renewalDate: new Date(),
      status: "inactive",

      pv: 0,
      bv: 0,
    });

    // Update sponsor directs
    await User.findOneAndUpdate(
      { userId: sponsorId },
      { $inc: { directs: 1 } }
    );

    // Placement left/right mapping
    if (placementId && placementSide) {
      if (placementSide === "left") {
        await User.findOneAndUpdate(
          { userId: placementId },
          { leftChild: userId }
        );
      } else if (placementSide === "right") {
        await User.findOneAndUpdate(
          { userId: placementId },
          { rightChild: userId }
        );
      }
    }

    // Tree data
    await User.findOneAndUpdate(
      { userId },
      {
        parentId: placementId || null,
        side: placementSide || null
      }
    );

    // Level mapping (1-10)
    let current = await User.findOne({ userId: sponsorId });

    for (let level = 1; level <= 10; level++) {
      if (!current) break;

      const levelField = "level" + level;

      await User.findOneAndUpdate(
        { userId: current.userId },
        { $push: { [levelField]: userId } }
      );

      current = await User.findOne({ userId: current.sponsorId });
    }

    // Response
    return res.status(201).json({
      status: true,
      message: "Signup successful",
      userId,
      loginPhone: phone,
    });

  } catch (error) {
    console.log("Signup error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error during signup",
    });
  }
};


// ======================================================
// LOGIN CONTROLLER (TOKEN FREE)
// ======================================================
export const login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        status: false,
        message: "Phone and password are required",
      });
    }

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(400).json({
        status: false,
        message: "User not found",
      });
    }

    const isMatch = bcrypt.compareSync(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        status: false,
        message: "Invalid password",
      });
    }

    // SUCCESS - return user identity only
    return res.status(200).json({
      status: true,
      message: "Login successful",

      // No token
      userId: user.userId,
      name: user.name,
      phone: user.phone,
      role: user.role || "user",

      // For MLM plan
      rank: user.rank || "Star",
      pv: user.pv || 0,
      bv: user.bv || 0,
      wallet: user.wallet || 0,
      packageType: user.packageType || "silver",
    });

  } catch (error) {
    console.log("Login error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error during login",
    });
  }
};
