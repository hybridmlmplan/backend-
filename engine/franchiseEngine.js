import Franchise from "../models/Franchise.js";
import Wallet from "../models/Wallet.js";

export const runFranchiseIncome = async (userId, bv) => {
  const percent = 5;
  const income = (bv * percent) / 100;

  await Franchise.create({
    userId,
    bv,
    percentage: percent,
    income,
    date: new Date()
  });

  const wallet = await Wallet.findOne({ userId });
  wallet.amount += income;
  wallet.history.push({
    amount: income,
    type: "FRANCHISE",
    remark: "Franchise Income",
    date: new Date()
  });
  await wallet.save();
};
