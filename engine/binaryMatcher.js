import User from "../models/User.js";
import PairHistory from "../models/PairHistory.js";
import Wallet from "../models/Wallet.js";
import { PACKAGES } from "../config/constants.js";

// PHASE-6 engines
import { runRankEngine } from "./rankEngine.js";
import { runRoyalty } from "./royaltyEngine.js";
import { addFund } from "./fundEngine.js";
import { runFranchiseIncome } from "./franchiseEngine.js";

export const runBinaryMatching = async (sessionNo) => {
  const users = await User.find({ isActive: true });

  for (let user of users) {
    const left = user.pvLeft;
    const right = user.pvRight;

    // ✅ Pair possible
    if (left > 0 && right > 0) {
      const pairs = Math.min(left, right, 1); // 1 pair per session

      if (pairs > 0) {
        const pkg = PACKAGES[user.package];
        const income = pkg.pairIncome;

        // 🔴→🟢 Pair history
        await PairHistory.create({
          userId: user.userId,
          sessionNo,
          side: "BOTH",
          status: "GREEN",
          income
        });

        // 💰 Wallet (Binary income)
        let wallet = await Wallet.findOne({ userId: user.userId });
        if (!wallet) wallet = await Wallet.create({ userId: user.userId });

        wallet.amount += income;
        wallet.history.push({
          amount: income,
          type: "BINARY",
          remark: "Binary pair income",
          date: new Date()
        });
        await wallet.save();

        // 🔻 Consume PV
        user.pvLeft -= pairs;
        user.pvRight -= pairs;
        await user.save();

        // =========================
        // 🔥 PHASE-6 AUTO TRIGGERS
        // =========================

        // 1️⃣ Rank Engine (pair based)
        await runRankEngine(user, pairs);

        // 2️⃣ Royalty (BV based – example 3%)
        await runRoyalty(user.userId, pkg.pv, 3);

        // 3️⃣ Fund (Car fund example)
        await addFund(user.userId, pkg.pv, "CAR");

        // 4️⃣ Franchise income
        await runFranchiseIncome(user.userId, pkg.pv);
      }
    }
  }
};
