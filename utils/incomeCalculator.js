const BVHistory = require("../models/BVHistory");
const businessRules = require("../config/businessRules");

// ============================
// ADD DIRECT INCOME
// ============================
async function addDirectIncome(userId, amount, source = "purchase") {
  const percent = 0; // Default off — plan disturb n ho

  const income = (amount * percent) / 100;

  if (income <= 0) return;

  await BVHistory.create({
    user: userId,
    amount: income,
    type: "direct",
    source,
  });
}

// ============================
// ADD LEVEL INCOME
// (placeholder – rules later)
// ============================
async function addLevelIncome(userId, amount, source = "purchase") {
  return; // disabled for now
}

// ============================
// ADD BINARY INCOME
// (placeholder – pairEngine later)
// ============================
async function addBinaryIncome(userId, amount, side, source = "purchase") {
  return; // disabled for now
}

// ============================
// ADD ROYALTY INCOME
// (placeholder – safe)
// ============================
async function addRoyaltyIncome(userId, amount, source = "purchase") {
  return; // disabled for now
}

// ============================
// ADD FUND INCOME (repurchase)
// ============================
async function addFundIncome(userId, amount, source = "purchase") {
  const percent = 0; // Default off — plan disturb n ho

  const income = (amount * percent) / 100;

  if (income <= 0) return;

  await BVHistory.create({
    user: userId,
    amount: income,
    type: "fund",
    source,
  });
}

// ============================
// EXPORT
// ============================
module.exports = {
  addDirectIncome,
  addLevelIncome,
  addBinaryIncome,
  addRoyaltyIncome,
  addFundIncome
};
