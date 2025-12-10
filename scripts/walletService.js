// backend/scripts/walletService.js
// Wallet helpers: add, deduct, ledger entry
// Usage: await addWalletTx(userId, amount, type, meta)

import Wallet from "../models/Wallet.js";
import WalletLedger from "../models/WalletLedger.js";

export async function addWalletTx(userId, amount, type = "credit", meta = {}) {
  if (!userId) throw new Error("userId required");
  // update wallet
  await Wallet.updateOne({ user: userId }, { $inc: { balance: amount } }, { upsert: true });
  const ledger = await WalletLedger.create({
    user: userId,
    change: amount,
    type,
    meta,
    createdAt: new Date()
  });
  return ledger;
}

export async function deductWalletTx(userId, amount, type = "debit", meta = {}) {
  if (!userId) throw new Error("userId required");
  await Wallet.updateOne({ user: userId }, { $inc: { balance: -amount } }, { upsert: true });
  const ledger = await WalletLedger.create({
    user: userId,
    change: -amount,
    type,
    meta,
    createdAt: new Date()
  });
  return ledger;
}

export default { addWalletTx, deductWalletTx };
