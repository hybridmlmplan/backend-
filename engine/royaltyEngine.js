import RoyaltyPool from "../models/RoyaltyPool.js";
import Wallet from "../models/Wallet.js";

export const runRoyalty = async (userId, bv, percent) => {
  const amount = (bv * percent) / 100;

  await RoyaltyPool.create({
    userId,
    percentage: percent,
    amount,
    date: new Date()
  });

  const wallet = await Wallet.findOne({ userId });
  wallet.amount += amount;
  wallet.history.push({
    amount,
    type: "ROYALTY",
    remark: "Royalty Income",
    date: new Date()
  });
  await wallet.save();
};
