const mongoose = require('mongoose');

const TreeNodeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // sponsor / parent
  left: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },   // left child
  right: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },  // right child
  position: { type: String, enum: ['left','right', null], default: null },
  depth: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Tree', TreeNodeSchema);
