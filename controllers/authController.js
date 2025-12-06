import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

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

    if (!name || !phone || !password)
      return res.status(400).json({
        status: false,
        message: "Name, phone & password are required",
      });

    if (!sponsorId)
      return res.status(400).json({
        status: false,
        message: "Sponsor ID is required",
      });

    const phoneExists = await User.findOne({ phone });
    if (phoneExists)
      return res.status(400).json({
        status: false,
        message: "Phone already registered",
      });

    const sponsor = await User.findOne({ userId: sponsorId });
    if (!sponsor)
      return res.status(400).json({
        status: false,
        message: "Invalid sponsor ID",
      });

    let validPlacement = null;
    if (placementId) {
      validPlacement = await User.findOne({ userId: placementId });
      if (!validPlacement)
        return res.status(400).json({
          status: false,
          message: "Invalid placement ID",
        });
    }

    // hash password
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    // generate user ID
    const userId = await generateUserId();

    const finalPackage =
      (packageType || "silver").toString().trim().toLowerCase();

    // 1) CREATE USER
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

    // 2) UPDATE SPONSOR DIRECTS
    await User.findOneAndUpdate(
      { userId: sponsorId },
      { $inc: { directs: 1 } }
    );

    // 3) UPDATE PLACEMENT TREE
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

    // 4) UPDATE USER TREE DATA
    await User.findOneAndUpdate(
      { userId },
      {
        parentId: placementId || null,
        side: placementSide || null
      }
    );

    // 5) LEVEL MAPPING (up to 10 levels)
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
// LOGIN CONTROLLER
// ======================================================
export const login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password)
      return res.status(400).json({
        status: false,
        message: "Phone and password are required",
      });

    const user = await User.findOne({ phone });
    if (!user)
      return res.status(400).json({
        status: false,
        message: "User not found",
      });

    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch)
      return res.status(400).json({
        status: false,
        message: "Invalid password",
      });

    const token = jwt.sign(
      { id: user.userId, phone: user.phone },
      "SECRET_KEY",
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      status: true,
      message: "Login successful",
      token,
      userId: user.userId,
      name: user.name,
      phone: user.phone
    });

  } catch (error) {
    console.log("Login error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error during login",
    });
  }
};
