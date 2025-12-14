import EPIN from "../models/EPIN.js";
import { PACKAGES } from "../config/constants.js";

export const generateEPIN = async (req, res) => {
  const { packageName } = req.body;
  const pkg = PACKAGES[packageName];

  const epin = await EPIN.create({
    code: "EPIN" + Date.now(),
    amount: pkg.price
  });

  res.json(epin);
};
