import User from "../models/User.js";
import PairHistory from "../models/PairHistory.js";
import Wallet from "../models/Wallet.js";
import { PACKAGES } from "../config/constants.js";

export const runBinaryMatching = async (sessionNo) => {
  const users = await User.find({ isActive: true });

  for (let user of users) {
    const left = user.pvLeft;
    const right = user.pvRight;

    if (left > 0 && right > 0) {
      const pairs = Math.min(left, right, 1); // 1 pair per session

      if (pairs > 0) {
        const income = PACKAGES[user.package].pairIncome;

        await PairHistory.create({
          userId: user.userId,
          sessionNo,
          side: "BOTH",
          status: "GREEN",
          income
        });

        let wallet = await Wallet.findOne({ userId: user.userId });
        if (!wallet) wallet = await Wallet.create({ userId: user.userId });

        wallet.amount += income;
        wallet.history.push({
          amount: income,
          type: "BINARY",
          remark: "Binary income credited",
          date: new Date()
        });

        await wallet.save();

        user.pvLeft -= pairs;
        user.pvRight -= pairs;
        await user.save();
      }
    }
  }
};
