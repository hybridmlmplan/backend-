// services/levelService.js
import User from "../models/User.js";
import LevelIncome from "../models/LevelIncome.js";
import Wallet from "../models/Wallet.js";
import WalletLedger from "../models/WalletLedger.js";
import Transaction from "../models/Transaction.js";
import { v4 as uuid } from "uuid";

const LEVEL_PERCENT = 0.5; // 0.5% per level
const MAX_LEVEL = 10;

export const distributeLevelIncome = async (fromUserId, bv) => {
  let current = await User.findById(fromUserId);
  if (!current) return;

  for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {
    if (!current.sponsor) break;

    const sponsor = await User.findById(current.sponsor);
    if (!sponsor) break;

    const amount = (bv * LEVEL_PERCENT) / 100;
    const txId = uuid();

    // Wallet update
    let wallet = await Wallet.findOne({ user: sponsor._id });
    if (!wallet) {
      wallet = await Wallet.create({ user: sponsor._id, balance: 0 });
    }

    wallet.balance += amount;
    await wallet.save();

    // Ledger entry
    await WalletLedger.create({
      userId: sponsor._id,
      txId,
      type: "credit",
      category: "level-income",
      amount,
      balanceAfter: wallet.balance,
      status: "completed",
      ref: fromUserId,
      note: `Level ${lvl} income from ${fromUserId}`,
    });

    // Transaction log
    await Transaction.create({
      txId,
      userId: sponsor._id,
      amount,
      type: "level-income",
      status: "completed",
      ref: fromUserId,
    });

    // LevelIncome log
    await LevelIncome.create({
      userId: sponsor._id,
      fromUser: fromUserId,
      level: lvl,
      bv,
      percentage: LEVEL_PERCENT,
      amount,
      txId,
    });

    current = sponsor;
  }
};
