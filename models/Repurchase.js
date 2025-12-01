const mongoose = require('mongoose');

const RepurchaseSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  package: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', required: true },
  amount: { type: Number, required: true },
  pv: { type: Number, default: 0 },
  bv: { type: Number, default: 0 },
  status: { type: String, enum: ['pending','completed','failed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  txId: { type: String } // optional transaction id / payment reference
});

module.exports = mongoose.model('Repurchase', RepurchaseSchema);
