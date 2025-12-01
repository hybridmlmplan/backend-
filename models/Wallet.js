const mongoose = require('mongoose');

const WalletSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  balance: { type: Number, default: 0 },
  pending: { type: Number, default: 0 },
  creditHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BVHistory' }], // refs
  debitHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BVHistory' }],
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Wallet', WalletSchema);
