const PVHistory = require('../models/PVHistory');
const User = require('../models/User');
const Wallet = require('../models/Wallet');

/**
 * getUserPV - return PV history and total PV for a user
 */
exports.getUserPV = async (req, res) => {
  try {
    const { userId } = req.params;
    const total = await PVHistory.aggregate([
      { $match: { user: require('mongoose').Types.ObjectId(userId), status: { $ne: 'void' } } },
      { $group: { _id: null, totalPV: { $sum: '$pv' } } }
    ]);
    const pvEntries = await PVHistory.find({ user: userId }).sort({ createdAt: -1 });
    res.json({ totalPV: (total[0] && total[0].totalPV) || 0, entries: pvEntries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * creditPV - admin credits PV to a user (creates PVHistory entry)
 * body: { userId, pv, source, remark }
 */
exports.creditPV = async (req, res) => {
  try {
    const { userId, pv, source, remark } = req.body;
    const entry = await PVHistory.create({
      user: userId,
      pv,
      source: source || 'admin_credit',
      remark
    });
    res.json({ success: true, entry });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * debitPV - admin debits PV
 */
exports.debitPV = async (req, res) => {
  try {
    const { userId, pv, remark } = req.body;
    const entry = await PVHistory.create({
      user: userId,
      pv: -Math.abs(pv),
      source: 'admin_debit',
      remark
    });
    res.json({ success: true, entry });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
