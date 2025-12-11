// routes/walletRoutes.js
// Wallet routes (SAFE): ledger entries, balance, withdrawal requests, admin approve/reject (manual).
// - Express + Mongoose
// - No automatic external payouts. Admin must process approved withdrawals manually via bank/TPS.
// - Requires models: User, WalletTransaction, WithdrawalRequest, Settings
//
// Models expected (fields used):
// User: { _id, userId, name, email, mobile, isAdmin }
// WalletTransaction: { userId, amount, type: 'CREDIT'|'DEBIT', reference, meta, status, createdAt }
// WithdrawalRequest: { userId, amount, method, details, status: 'PENDING'|'APPROVED'|'REJECTED'|'PAID', adminNote, createdAt, updatedAt, processedBy }
// Settings: { withdrawalMin, withdrawalFeePercent, withdrawalEnabled }

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { Types } = mongoose;
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const Settings = require('../models/Settings');

/* -----------------------
   Helper: compute balance
   -----------------------
   Sum of credits - sum of debits from wallet_transactions where status != 'REVERSED'
*/
async function computeBalance(userId) {
  const agg = await WalletTransaction.aggregate([
    { $match: { userId: Types.ObjectId(userId), status: { $ne: 'REVERSED' } } },
    {
      $group: {
        _id: null,
        credit: { $sum: { $cond: [{ $eq: ['$type', 'CREDIT'] }, '$amount', 0] } },
        debit: { $sum: { $cond: [{ $eq: ['$type', 'DEBIT'] }, '$amount', 0] } }
      }
    }
  ]);
  const credit = agg[0]?.credit || 0;
  const debit = agg[0]?.debit || 0;
  return Number((credit - debit).toFixed(2));
}

/* -----------------------
   ROUTES
   ----------------------- */

/**
 * GET /wallet/balance
 * Return user's available balance (computed from ledger)
 */
router.get('/balance', auth, async (req, res) => {
  try {
    const balance = await computeBalance(req.user.id);
    res.json({ balance });
  } catch (err) {
    console.error('GET /wallet/balance', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /wallet/transactions
 * Query user's transactions (paginated)
 * Query params: page, limit, type (CREDIT/DEBIT), status
 */
router.get('/transactions', auth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(200, parseInt(req.query.limit || '50'));
    const skip = (page - 1) * limit;
    const filter = { userId: Types.ObjectId(req.user.id) };

    if (req.query.type && ['CREDIT', 'DEBIT'].includes(req.query.type)) filter.type = req.query.type;
    if (req.query.status) filter.status = req.query.status;

    const total = await WalletTransaction.countDocuments(filter);
    const rows = await WalletTransaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();

    res.json({ page, limit, total, transactions: rows });
  } catch (err) {
    console.error('GET /wallet/transactions', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /wallet/request-withdrawal
 * Body: { amount, method, details }
 * Creates a withdrawal request (PENDING). Admin must approve and mark as PAID after manual payout.
 */
router.post('/request-withdrawal', auth, async (req, res) => {
  try {
    const { amount, method, details } = req.body;
    const amt = Number(amount || 0);
    if (!amt || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const settings = await Settings.findOne({}) || {};
    const min = Number(settings.withdrawalMin || 100);
    const enabled = settings.withdrawalEnabled !== false;

    if (!enabled) return res.status(403).json({ error: 'Withdrawals are currently disabled' });
    if (amt < min) return res.status(400).json({ error: `Minimum withdrawal is ${min}` });

    const balance = await computeBalance(req.user.id);
    if (amt > balance) return res.status(400).json({ error: 'Insufficient balance' });

    // Create withdrawal request (PENDING). Do not deduct user balance yet — admin will debit on approval or when marking PAID.
    const wr = new WithdrawalRequest({
      userId: Types.ObjectId(req.user.id),
      amount: amt,
      method: method || 'bank',
      details: details || {},
      status: 'PENDING',
      createdAt: new Date()
    });

    await wr.save();

    res.json({ success: true, requestId: wr._id, status: wr.status });
  } catch (err) {
    console.error('POST /wallet/request-withdrawal', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /wallet/withdrawals/me
 * List current user's withdrawal requests
 */
router.get('/withdrawals/me', auth, async (req, res) => {
  try {
    const rows = await WithdrawalRequest.find({ userId: Types.ObjectId(req.user.id) }).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ withdrawals: rows });
  } catch (err) {
    console.error('GET /wallet/withdrawals/me', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* -----------------------
   ADMIN ROUTES
   ----------------------- */

/**
 * GET /wallet/withdrawals
 * Admin: list withdrawal requests (filter by status)
 */
router.get('/withdrawals', auth, admin, async (req, res) => {
  try {
    const status = req.query.status; // PENDING / APPROVED / REJECTED / PAID
    const filter = {};
    if (status) filter.status = status;
    const rows = await WithdrawalRequest.find(filter).sort({ createdAt: -1 }).limit(1000).lean();
    res.json({ withdrawals: rows });
  } catch (err) {
    console.error('GET /wallet/withdrawals', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /wallet/withdrawals/:id/approve
 * Admin: approve a withdrawal request (marks APPROVED). Admin should then perform manual payout and later mark PAID.
 * Body: { adminNote }
 *
 * IMPORTANT: This route does NOT send money. It only marks request approved and creates a pending DEBIT transaction (ledger) with status 'PENDING_DEBIT'.
 * When admin completes real payout, they must call /withdrawals/:id/mark-paid to finalize and set transaction status to 'COMPLETED' and debit user.
 */
router.post('/withdrawals/:id/approve', auth, admin, async (req, res) => {
  const wrId = req.params.id;
  const { adminNote } = req.body;
  if (!Types.ObjectId.isValid(wrId)) return res.status(400).json({ error: 'Invalid id' });

  const client = await mongoose.startSession();
  client.startTransaction();
  try {
    const wr = await WithdrawalRequest.findById(wrId).session(client);
    if (!wr) {
      await client.abortTransaction();
      client.endSession();
      return res.status(404).json({ error: 'Request not found' });
    }
    if (wr.status !== 'PENDING') {
      await client.abortTransaction();
      client.endSession();
      return res.status(400).json({ error: 'Only PENDING requests can be approved' });
    }

    // create ledger pending debit (for record). We keep it 'PENDING' until mark-paid is called
    const pendingDebit = new WalletTransaction({
      userId: wr.userId,
      amount: wr.amount,
      type: 'DEBIT',
      reference: `withdrawal:${wr._id}`,
      meta: { withdrawalId: wr._id, note: 'Pending admin-approved withdrawal' },
      status: 'PENDING',
      createdAt: new Date()
    });

    await pendingDebit.save({ session: client });

    // update withdrawal request
    wr.status = 'APPROVED';
    wr.adminNote = adminNote || '';
    wr.updatedAt = new Date();
    wr.processedBy = req.user.id;
    await wr.save({ session: client });

    await client.commitTransaction();
    client.endSession();

    res.json({ success: true, withdrawalId: wr._id, ledgerId: pendingDebit._id });
  } catch (err) {
    await client.abortTransaction().catch(() => {});
    client.endSession();
    console.error('POST /wallet/withdrawals/:id/approve', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /wallet/withdrawals/:id/reject
 * Admin: reject request. Optionally add adminNote.
 */
router.post('/withdrawals/:id/reject', auth, admin, async (req, res) => {
  const wrId = req.params.id;
  const { adminNote } = req.body;
  if (!Types.ObjectId.isValid(wrId)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const wr = await WithdrawalRequest.findById(wrId);
    if (!wr) return res.status(404).json({ error: 'Request not found' });
    if (wr.status !== 'PENDING') return res.status(400).json({ error: 'Only PENDING can be rejected' });

    wr.status = 'REJECTED';
    wr.adminNote = adminNote || '';
    wr.updatedAt = new Date();
    wr.processedBy = req.user.id;
    await wr.save();

    res.json({ success: true, withdrawalId: wr._id, status: wr.status });
  } catch (err) {
    console.error('POST /wallet/withdrawals/:id/reject', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /wallet/withdrawals/:id/mark-paid
 * Admin: AFTER manual payout completed via bank/TPS, mark request PAID
 * This will:
 *   - Set withdrawal.status = 'PAID'
 *   - Update corresponding pending WalletTransaction status -> 'COMPLETED'
 *   - Create final debit entry if not present
 *
 * Body: { externalRef (txn id), adminNote }
 */
router.post('/withdrawals/:id/mark-paid', auth, admin, async (req, res) => {
  const wrId = req.params.id;
  const { externalRef, adminNote } = req.body;
  if (!Types.ObjectId.isValid(wrId)) return res.status(400).json({ error: 'Invalid id' });

  const client = await mongoose.startSession();
  client.startTransaction();
  try {
    const wr = await WithdrawalRequest.findById(wrId).session(client);
    if (!wr) {
      await client.abortTransaction();
      client.endSession();
      return res.status(404).json({ error: 'Request not found' });
    }
    if (!['APPROVED', 'PENDING'].includes(wr.status)) {
      await client.abortTransaction();
      client.endSession();
      return res.status(400).json({ error: 'Request must be APPROVED or PENDING to mark PAID' });
    }

    // find pending ledger tx
    const pendingLedger = await WalletTransaction.findOne({ 'meta.withdrawalId': wr._id, type: 'DEBIT', status: 'PENDING' }).session(client);

    if (pendingLedger) {
      pendingLedger.status = 'COMPLETED';
      pendingLedger.reference = pendingLedger.reference || `withdrawal:${wr._id}`;
      pendingLedger.meta = { ...pendingLedger.meta, externalRef };
      pendingLedger.updatedAt = new Date();
      await pendingLedger.save({ session: client });
    } else {
      // create debit entry (completed)
      const debit = new WalletTransaction({
        userId: wr.userId,
        amount: wr.amount,
        type: 'DEBIT',
        reference: `withdrawal:${wr._id}`,
        meta: { withdrawalId: wr._id, externalRef },
        status: 'COMPLETED',
        createdAt: new Date()
      });
      await debit.save({ session: client });
    }

    wr.status = 'PAID';
    wr.adminNote = adminNote || wr.adminNote || '';
    wr.externalRef = externalRef || null;
    wr.updatedAt = new Date();
    wr.processedBy = req.user.id;
    await wr.save({ session: client });

    await client.commitTransaction();
    client.endSession();

    res.json({ success: true, withdrawalId: wr._id, status: 'PAID' });
  } catch (err) {
    await client.abortTransaction().catch(() => {});
    client.endSession();
    console.error('POST /wallet/withdrawals/:id/mark-paid', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /wallet/admin/credit
 * Admin: add credit (manual ledger entry) to user wallet (e.g., pair payout, adjustments)
 * Body: { userId, amount, reference, note }
 *
 * NOTE: For automated payouts (pair engine), you should still call server-side function that creates 'CREDIT' transactions.
 */
router.post('/admin/credit', auth, admin, async (req, res) => {
  try {
    const { userId, amount, reference, note } = req.body;
    if (!userId || !amount) return res.status(400).json({ error: 'userId & amount required' });

    const user = await User.findOne({ userId }) || await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const tx = new WalletTransaction({
      userId: user._id,
      amount: Number(amount),
      type: 'CREDIT',
      reference: reference || 'admin-credit',
      meta: { note: note || '' },
      status: 'COMPLETED',
      createdAt: new Date()
    });

    await tx.save();

    res.json({ success: true, txId: tx._id });
  } catch (err) {
    console.error('POST /wallet/admin/credit', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /wallet/admin/reverse-tx
 * Admin: reverse a wallet transaction (mark REVERSED and optionally create compensation)
 * Body: { txId, reason, createCompensation: boolean }
 */
router.post('/admin/reverse-tx', auth, admin, async (req, res) => {
  try {
    const { txId, reason, createCompensation } = req.body;
    if (!txId) return res.status(400).json({ error: 'txId required' });

    const tx = await WalletTransaction.findById(txId);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    if (tx.status === 'REVERSED') return res.status(400).json({ error: 'Already reversed' });

    tx.status = 'REVERSED';
    tx.meta = { ...tx.meta, reversedReason: reason || 'admin reversal' };
    tx.updatedAt = new Date();
    await tx.save();

    if (createCompensation) {
      // create opposite transaction to compensate (safe record)
      const comp = new WalletTransaction({
        userId: tx.userId,
        amount: tx.amount,
        type: tx.type === 'CREDIT' ? 'DEBIT' : 'CREDIT',
        reference: `compensate:${tx._id}`,
        meta: { note: 'Compensation for reversed tx ' + tx._id },
        status: 'COMPLETED',
        createdAt: new Date()
      });
      await comp.save();
    }

    res.json({ success: true, reversedTx: tx._id });
  } catch (err) {
    console.error('POST /wallet/admin/reverse-tx', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
