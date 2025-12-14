import User from "../models/User.js";
import RankHistory from "../models/RankHistory.js";
import Wallet from "../models/Wallet.js";

const RANKS = [
  { name: "STAR", income: 10 },
  { name: "SILVER STAR", income: 20 },
  { name: "GOLD STAR", income: 40 },
  { name: "RUBY STAR", income: 80 },
  { name: "EMERALD STAR", income: 160 },
  { name: "DIAMOND STAR", income: 320 },
  { name: "CROWN STAR", income: 640 },
  { name: "AMBASSADOR STAR", income: 1280 },
  { name: "COMPANY STAR", income: 2560 }
];

export const runRankEngine = async (user, pairsCompleted) => {
  const index = Math.min(pairsCompleted - 1, RANKS.length - 1);
  const rank = RANKS[index];

  const exists = await RankHistory.findOne({ userId: user.userId, rank: rank.name });
  if (exists) return;

  await RankHistory.create({
    userId: user.userId,
    package: user.package,
    rank: rank.name,
    income: rank.income,
    achievedAt: new Date()
  });

  let wallet = await Wallet.findOne({ userId: user.userId });
  wallet.amount += rank.income;
  wallet.history.push({
    amount: rank.income,
    type: "RANK",
    remark: `${rank.name} Rank Income`,
    date: new Date()
  });
  await wallet.save();
};
