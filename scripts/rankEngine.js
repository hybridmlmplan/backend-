// backend/scripts/rankEngine.js
// Calculates rank upgrades based on pair completions (8 pairs -> upgrade), maintains rank history
// Usage: import { evaluateRankForUser } from "./rankEngine.js"; await evaluateRankForUser(userId);

import User from "../models/User.js";
import Rank from "../models/Rank.js"; // model storing user's current rank info
import Binary from "../models/Binary.js";
import Transaction from "../models/Transaction.js;
import { creditRankIncome } from "./royaltyEngine.js";

const RANK_PAIRS_REQUIRED = 8; // 4 income + 4 cutoff per rules

export async function evaluateRankForUser(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    // Count completed pairs for user (green) across packages
    const completedPairs = await Binary.find({ userId, isGreen: true }).countDocuments();

    // Determine how many rank upgrades possible
    const currentRank = await Rank.findOne({ user: userId }) || { level: 0 }; // level 0 initial
    const totalRankLevelsGained = Math.floor(completedPairs / RANK_PAIRS_REQUIRED);
    if (totalRankLevelsGained > currentRank.level) {
      // upgrade user to new level(s)
      const oldLevel = currentRank.level || 0;
      const newLevel = totalRankLevelsGained;
      currentRank.level = newLevel;
      currentRank.updatedAt = new Date();
      await Rank.updateOne({ user: userId }, currentRank, { upsert: true });

      // For each newly achieved level, credit rank income (according to package/rank mapping)
      for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
        const income = calculateRankIncomeForLevel(user.packageCode || "silver", lvl);
        if (income > 0) {
          await creditRankIncome(userId, income, { rankLevel: lvl });
        }
      }
      return { upgraded: true, from: oldLevel, to: newLevel };
    }
    return { upgraded: false, level: currentRank.level || 0 };
  } catch (err) {
    console.error("rankEngine.evaluateRankForUser error:", err);
    return { error: err.message };
  }
}

function calculateRankIncomeForLevel(packageCode, level) {
  // mapping from plan: level -> income amount (1..9)
  const mapSilver = [10,20,40,80,160,320,640,1280,2560];
  const mapGold = [50,100,200,400,800,1600,3200,6400,12800];
  const mapRuby = [500,1000,2000,4000,8000,16000,32000,64000,128000];

  const idx = Math.max(0, level - 1);
  if (packageCode === "gold") return mapGold[idx] || 0;
  if (packageCode === "ruby") return mapRuby[idx] || 0;
  return mapSilver[idx] || 0;
}

export default { evaluateRankForUser, calculateRankIncomeForLevel };
