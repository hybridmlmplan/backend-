const Purchase = require('../models/Purchase');
const Repurchase = require('../models/Repurchase');
const PVHistory = require('../models/PVHistory');
const BVHistory = require('../models/BVHistory');
const Wallet = require('../models/Wallet');
const User = require('../models/User');

const pvEngine = require('../utils/pvengine');       // existing util
const pairEngine = require('../utils/pairengine');   // existing util
const getNextGsmId = require('../utils/getNextGsmId');

async function activatePurchase({ purchaseId, activatedBy }) {
  // purchaseId can be Purchase or Repurchase
  const purchase = await Purchase.findById(purchaseId) || await Repurchase.findById(purchaseId);
  if (!purchase) throw new Error('Purchase not found');

  if (purchase.status === 'completed') {
    return { alreadyActivated: true };
  }

  // mark as completed
  purchase.status = 'completed';
  purchase.activatedAt = new Date();
  await purchase.save();

  // credit PV and BV based on package stored in purchase
  const packageObj = purchase.package; // may be populated or id
  // attempt to compute pv/bv using pvEngine (assumed function)
  // pvEngine.creditPV(userId, pv, source, remark) etc. -- adapt based on actual util
  const userId = purchase.user;
  const pvAmount = purchase.pv || (packageObj && packageObj.pv) || 0;
  const bvAmount = purchase.bv || (packageObj && packageObj.bv) || 0;

  // create PVHistory
  await PVHistory.create({
    user: userId,
    pv: pvAmount,
    source: 'activation',
    remark: `Activation for purchase ${purchaseId}`
  });

  // create BVHistory and credit wallet
  await BVHistory.create({
    user: userId,
    bv: bvAmount,
    source: 'activation',
    remark: `Activation BV for purchase ${purchaseId}`
  });

  // update wallet
  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) {
    wallet = await Wallet.create({ user: userId, balance: 0 });
  }
  wallet.balance += bvAmount;
  await wallet.save();

  // run pairing/level engine to distribute incomes
  try {
    await pairEngine.processOnActivation({ userId, pv: pvAmount, bv: bvAmount });
  } catch (e) {
    // log but do not block activation
    console.error('pairEngine error:', e);
  }

  // run any PV engine distributions if needed
  try {
    await pvEngine.processPV({ userId, pv: pvAmount });
  } catch (e) {
    console.error('pvEngine error:', e);
  }

  // optionally get next GSM id and attach
  try {
    const gsmSeq = await getNextGsmId('activation_gsm');
    purchase.gsmId = `GSM${String(gsmSeq).padStart(6, '0')}`;
    await purchase.save();
  } catch (err) {
    console.error('gsm id error', err);
  }

  return { success: true, purchaseId: purchase._id };
}

module.exports = { activatePurchase };
