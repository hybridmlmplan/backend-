import EPIN from "../models/EPIN.js";
import User from "../models/User.js";
import { PACKAGES } from "../config/constants.js";

export const activatePackage = async (req, res) => {
  const { userId, epinCode, packageName } = req.body;

  const epin = await EPIN.findOne({ code: epinCode, used: false });
  if (!epin) return res.status(400).json({ message: "Invalid EPIN" });

  const pkg = PACKAGES[packageName];

  await User.findOneAndUpdate(
    { userId },
    {
      package: packageName,
      isActive: true,
      pv: pkg.pv
    }
  );

  epin.used = true;
  epin.usedBy = userId;
  await epin.save();

  res.json({ message: "Package Activated Successfully" });
};
