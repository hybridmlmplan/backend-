import FundPool from "../models/FundPool.js";
import Wallet from "../models/Wallet.js";

export const addFund = async (userId, bv, fundType) => {
  const percent = fundType === "CAR" ? 2 : fundType === "HOUSE" ? 2 : 0;
  const amount = (bv * percent) / 100;

  if (amount <= 0) return;

  await FundPool.create({
    userId,
    fundType,
    amount,
    date: new Date()
  });

  const wallet = await Wallet.findOne({ userId });
  wallet.amount += amount;
  wallet.history.push({
    amount,
    type: "FUND",
    remark: `${fundType} Fund Income`,
    date: new Date()
  });
  await wallet.save();
};
