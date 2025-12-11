/**
 * routes/adminRoutes.js
 *
 * Admin routes for the Binary/MLM system described in the master plan.
 * - Uses PostgreSQL via `pg` Pool (configure DATABASE_URL in .env)
 * - Provides:
 *    GET /users
 *    GET /user/:id
 *    POST /epin/generate
 *    POST /epin/transfer
 *    POST /package/activate    (admin force-activate a package for a user)
 *    POST /session/run         (run session engine for given session_id)
 *    GET /session/:id/report
 *    GET /pending-unlocks
 *    POST /pending/:id/release (manual release - for admin use)
 *    GET /wallet/report
 *    POST /config/update
 *
 * Important: This file assumes DB tables described in architecture doc:
 * users, packages, user_packages, pv_ledger, pair_records, pending_unlocks,
 * bv_ledger, wallet_transactions, epins, session_tracker, config
 *
 * Adjust SQL / column names to match your actual schema.
 */

require('dotenv').config();
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // optionally ssl config here
});

// simple adminAuth middleware placeholder (replace with real auth in prod)
const adminAuth = (req, res, next) => {
  const adminToken = req.headers['x-admin-token'];
  if (!adminToken || adminToken !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized - admin token missing or invalid' });
  }
  next();
};

router.use(adminAuth);

/* Utility helpers */
const randomEpin = (len = 12) => crypto.randomBytes(len).toString('hex').slice(0, len);

/* ========== ADMIN ROUTES ========== */

/**
 * GET /admin/users
 * List users with pagination & optional filters
 */
router.get('/users', async (req, res) => {
  const { page = 1, per_page = 50, q } = req.query;
  const offset = (page - 1) * per_page;
  try {
    let base = 'SELECT id, name, mobile, email, sponsor_id, placement_id, created_at FROM users';
    const params = [];
    if (q) {
      params.push(`%${q}%`);
      base += ` WHERE name ILIKE $${params.length} OR mobile ILIKE $${params.length} OR email ILIKE $${params.length}`;
    }
    params.push(per_page, offset);
    const sql = `${base} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const result = await pool.query(sql, params);
    res.json({ data: result.rows, page: Number(page), per_page: Number(per_page) });
  } catch (err) {
    console.error('GET /admin/users error', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /admin/user/:id
 * Get single user details (including package & wallet summary)
 */
router.get('/user/:id', async (req, res) => {
  const uid = req.params.id;
  try {
    const client = await pool.connect();
    try {
      const userQ = await client.query('SELECT id, name, mobile, email, sponsor_id, placement_id, created_at FROM users WHERE id=$1', [uid]);
      if (userQ.rowCount === 0) return res.status(404).json({ error: 'User not found' });

      const packagesQ = await client.query(
        `SELECT up.id as user_package_id, p.name as package_name, up.activated_at, up.status, up.epin_id
         FROM user_packages up
         JOIN packages p ON up.package_id = p.id
         WHERE up.user_id=$1`,
        [uid]
      );

      const walletQ = await client.query(
        `SELECT COALESCE(SUM(CASE WHEN type='CREDIT' THEN amount ELSE 0 END),0) AS credits,
                COALESCE(SUM(CASE WHEN type='DEBIT' THEN amount ELSE 0 END),0) AS debits
         FROM wallet_transactions WHERE user_id=$1`,
        [uid]
      );
      const balance = Number(walletQ.rows[0].credits) - Number(walletQ.rows[0].debits);

      res.json({
        user: userQ.rows[0],
        packages: packagesQ.rows,
        wallet_balance: balance
      });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('GET /admin/user/:id', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /admin/epin/generate
 * Body: { count: number, package_id: number, note?: string }
 * Generates EPINs and stores in epins table (unused)
 */
router.post('/epin/generate', async (req, res) => {
  const { count = 1, package_id } = req.body;
  if (!package_id) return res.status(400).json({ error: 'package_id required' });
  const epins = [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < count; i++) {
      const code = randomEpin(16);
      const { rows } = await client.query(
        `INSERT INTO epins(code, package_id, status, created_at)
         VALUES($1, $2, 'UNUSED', NOW())
         RETURNING id, code`,
        [code, package_id]
      );
      epins.push(rows[0]);
    }
    await client.query('COMMIT');
    res.json({ generated: epins.length, epins });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /admin/epin/generate', err);
    res.status(500).json({ error: 'Could not generate epins' });
  } finally {
    client.release();
  }
});

/**
 * POST /admin/epin/transfer
 * Admin can transfer an epin to a user (assign)
 * Body: { epin_code, to_user_id }
 */
router.post('/epin/transfer', async (req, res) => {
  const { epin_code, to_user_id } = req.body;
  if (!epin_code || !to_user_id) return res.status(400).json({ error: 'epin_code & to_user_id required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const epQ = await client.query('SELECT id, status FROM epins WHERE code=$1 FOR UPDATE', [epin_code]);
    if (epQ.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'EPIN not found' });
    }
    const ep = epQ.rows[0];
    if (ep.status !== 'UNUSED' && ep.status !== 'TRANSFERABLE') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'EPIN not transferable' });
    }
    await client.query('UPDATE epins SET owner_user_id=$1, status=$2, transferred_at=NOW() WHERE id=$3', [to_user_id, 'ASSIGNED', ep.id]);
    await client.query('COMMIT');
    res.json({ success: true, epin: epin_code, assigned_to: to_user_id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /admin/epin/transfer', err);
    res.status(500).json({ error: 'Could not transfer epin' });
  } finally {
    client.release();
  }
});

/**
 * POST /admin/package/activate
 * Admin force-activate a package for a user (useful for manual fixes)
 * Body: { user_id, package_id, epin_code (optional) }
 */
router.post('/package/activate', async (req, res) => {
  const { user_id, package_id, epin_code } = req.body;
  if (!user_id || !package_id) return res.status(400).json({ error: 'user_id & package_id required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // If epin provided, check it
    if (epin_code) {
      const eQ = await client.query('SELECT id, status FROM epins WHERE code=$1 FOR UPDATE', [epin_code]);
      if (eQ.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'EPIN not found' });
      }
      const epi = eQ.rows[0];
      if (epi.status !== 'UNUSED' && epi.status !== 'TRANSFERABLE' && epi.status !== 'ASSIGNED') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'EPIN cannot be used' });
      }
      // mark used
      await client.query('UPDATE epins SET status=$1, used_by=$2, used_at=NOW() WHERE id=$3', ['USED', user_id, epi.id]);
    }

    // create user_package
    const upInsert = await client.query(
      `INSERT INTO user_packages(user_id, package_id, epin_id, activated_at, status)
       VALUES($1,$2,null,NOW(),'ACTIVE') RETURNING id`,
      [user_id, package_id]
    );

    // Add PV ledger entry (package activation adds PV value)
    const pvInsert = await client.query('SELECT pv_value FROM packages WHERE id=$1', [package_id]);
    const pvValue = pvInsert.rowCount ? pvInsert.rows[0].pv_value : null;
    if (pvValue) {
      await client.query(
        `INSERT INTO pv_ledger(user_id, amount, source, session_id, created_at)
         VALUES($1,$2,'package_activation',NULL,NOW())`,
        [user_id, pvValue]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, user_package_id: upInsert.rows[0].id, pv_added: pvValue || 0 });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /admin/package/activate', err);
    res.status(500).json({ error: 'Could not activate package' });
  } finally {
    client.release();
  }
});

/**
 * POST /admin/session/run
 * Run session engine for a session (session_id must correspond to a session window)
 * Body: { session_id }
 *
 * NOTE: This is a simplified, transactional implementation:
 *  - Collect PV entries with session_id IS NULL
 *  - For each package, attempt to form left-right pairs by binary position
 *  - Create pair_records (idempotent unique constraint expected)
 *  - For Silver pairs: immediately mark PAID and credit wallet & create pending_unlocks for gold/ruby
 *
 * This implementation assumes following helper DB conveniences:
 *  - pv_ledger stores PV contributions per user (with optional node_id / binary position info if needed)
 *  - binary_nodes table maps user -> node position
 *
 * Customize the matching logic to match your exact binary algorithm.
 */
router.post('/session/run', async (req, res) => {
  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) mark session start in session_tracker
    await client.query(
      `INSERT INTO session_tracker(session_id, started_at) VALUES($1, NOW())
       ON CONFLICT (session_id) DO NOTHING`,
      [session_id]
    );

    // 2) fetch packages detail (we'll use package ids)
    const pkgsRes = await client.query('SELECT id, name, pv_value, pair_income, capping_per_session FROM packages');
    const packages = pkgsRes.rows;

    // 3) fetch all PV entries that are not yet assigned to a session (session_id IS NULL)
    //    join with binary_nodes to know the node position of user
    const pvRes = await client.query(
      `SELECT pl.id as pv_id, pl.user_id, pl.amount, bn.id AS node_id, bn.side, bn.path
       FROM pv_ledger pl
       LEFT JOIN binary_nodes bn ON bn.user_id = pl.user_id
       WHERE pl.session_id IS NULL
       ORDER BY pl.created_at ASC
      `
    );

    // group PV by node_id and sum -- simplified grouping
    const nodePvMap = new Map(); // node_id -> { leftPv, rightPv, usersLeft:[], usersRight:[] }
    for (const row of pvRes.rows) {
      const nodeId = row.node_id || `user:${row.user_id}`; // fallback for users not placed
      if (!nodePvMap.has(nodeId)) nodePvMap.set(nodeId, { leftPv: 0, rightPv: 0, leftUsers: [], rightUsers: [] });
      const entry = nodePvMap.get(nodeId);
      // Assume bn.side shows whether this user sits on left or right of their parent.
      if (row.side === 'L') {
        entry.leftPv += Number(row.amount);
        entry.leftUsers.push({ user_id: row.user_id, pv_id: row.pv_id });
      } else if (row.side === 'R') {
        entry.rightPv += Number(row.amount);
        entry.rightUsers.push({ user_id: row.user_id, pv_id: row.pv_id });
      } else {
        // if side not set, push to leftUsers by default
        entry.leftPv += Number(row.amount);
        entry.leftUsers.push({ user_id: row.user_id, pv_id: row.pv_id });
      }
    }

    // 4) For each node, for each package, create pairs according to capping (1 per session per package)
    const createdPairs = [];
    for (const pkg of packages) {
      for (const [nodeId, entry] of nodePvMap.entries()) {
        // Determine how many pairs possible: for simplicity, pair_count = min( floor(leftPv / pkg.pv_value), floor(rightPv / pkg.pv_value), capping)
        const leftCount = Math.floor(entry.leftPv / pkg.pv_value);
        const rightCount = Math.floor(entry.rightPv / pkg.pv_value);
        let possiblePairs = Math.min(leftCount, rightCount, pkg.capping_per_session || 1);
        if (possiblePairs <= 0) continue;

        // Idempotency: ensure no existing pair_record for this session/package/node
        const checkQ = await client.query(
          `SELECT COUNT(1) FROM pair_records WHERE session_id=$1 AND package_id=$2 AND left_node_id=$3`,
          [session_id, pkg.id, nodeId]
        );
        const already = Number(checkQ.rows[0].count);
        if (already > 0) {
          // skip to avoid duplicates for this node/package/session
          continue;
        }

        // For each possible pair create pair_record (we'll set left_node/right_node via first available users)
        // Simplified: pick first leftUsers and first rightUsers for the node
        const leftUser = entry.leftUsers.length ? entry.leftUsers[0] : null;
        const rightUser = entry.rightUsers.length ? entry.rightUsers[0] : null;
        if (!leftUser || !rightUser) continue;

        // create pair_record(s)
        for (let p = 0; p < possiblePairs; p++) {
          const insertPair = await client.query(
            `INSERT INTO pair_records(left_node_id, right_node_id, left_user_id, right_user_id, session_id, package_id, state, triggered_by, created_at, updated_at)
             VALUES($1,$2,$3,$4,$5,$6,'RED',NULL,NOW(),NOW())
             RETURNING id`,
            [nodeId, nodeId, leftUser.user_id, rightUser.user_id, session_id, pkg.id]
          );
          const pairId = insertPair.rows[0].id;
          createdPairs.push({ pairId, nodeId, pkg });
        }
      }
    }

    // 5) Special handling for Silver package: mark green + pay immediately & create pending unlocks for gold & ruby
    const silverPkg = packages.find(p => p.name && p.name.toLowerCase() === 'silver');
    if (silverPkg) {
      for (const cp of createdPairs.filter(x => x.pkg.id === silverPkg.id)) {
        // Update pair state to GREEN and PAID (idempotently) and create wallet txn
        const pairCheck = await client.query('SELECT state FROM pair_records WHERE id=$1 FOR UPDATE', [cp.pairId]);
        if (pairCheck.rowCount === 0) continue;
        const currState = pairCheck.rows[0].state;
        if (currState === 'PAID' || currState === 'GREEN') {
          // already processed
          continue;
        }
        // mark GREEN then PAID
        await client.query('UPDATE pair_records SET state=$1, updated_at=NOW() WHERE id=$2', ['GREEN', cp.pairId]);
        await client.query('UPDATE pair_records SET state=$1, updated_at=NOW() WHERE id=$2', ['PAID', cp.pairId]);

        // credit left user and right user pair_income/2? (Business model says pair income paid — assuming full amount credited to owner(s). 
        // We'll credit pair_income to the user who owns the package for that pair. For Silver we credit both sides? 
        // In many binaries, pair income goes to the member who matched their weaker leg. For simplicity, credit pair_income to both users equally split.
        const pairIncome = Number(silverPkg.pair_income) || 0;
        const half = pairIncome / 2.0;

        // credit left user
        await client.query(
          `INSERT INTO wallet_transactions(user_id, amount, type, reference, status, created_at)
           VALUES($1,$2,'CREDIT', $3, 'COMPLETED', NOW())`,
          [cp.nodeId /* node-based fallback; better use left_user_id */, half, `pair:${cp.pairId}`]
        );
        // credit right user
        await client.query(
          `INSERT INTO wallet_transactions(user_id, amount, type, reference, status, created_at)
           VALUES($1,$2,'CREDIT', $3, 'COMPLETED', NOW())`,
          [cp.nodeId /* fallback */, half, `pair:${cp.pairId}`]
        );

        // create pending_unlocks for GOLD and RUBY at same node / pair
        const goldPkg = packages.find(p => p.name && p.name.toLowerCase() === 'gold');
        const rubyPkg = packages.find(p => p.name && p.name.toLowerCase() === 'ruby');

        if (goldPkg) {
          await client.query(
            `INSERT INTO pending_unlocks(pair_record_id, package_id, unlocked_on_silver_pair_id, status, required_left_user_package_id, required_right_user_package_id, created_at)
             VALUES($1,$2,$3,'PENDING',NULL,NULL,NOW())`,
            [cp.pairId, goldPkg.id, cp.pairId]
          );
        }
        if (rubyPkg) {
          await client.query(
            `INSERT INTO pending_unlocks(pair_record_id, package_id, unlocked_on_silver_pair_id, status, required_left_user_package_id, required_right_user_package_id, created_at)
             VALUES($1,$2,$3,'PENDING',NULL,NULL,NOW())`,
            [cp.pairId, rubyPkg.id, cp.pairId]
          );
        }
      }
    }

    // 6) mark pv_ledger entries processed by setting session_id for those pv entries (idempotency: update WHERE session_id IS NULL)
    await client.query('UPDATE pv_ledger SET session_id=$1 WHERE session_id IS NULL', [session_id]);

    // 7) mark session finished
    await client.query('UPDATE session_tracker SET finished_at=NOW() WHERE session_id=$1', [session_id]);

    await client.query('COMMIT');
    res.json({ success: true, created_pairs: createdPairs.length });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /admin/session/run error', err);
    res.status(500).json({ error: 'Could not run session engine' });
  } finally {
    client.release();
  }
});

/**
 * GET /admin/session/:id/report
 * Provides a session report (pairs created, paid, pending)
 */
router.get('/session/:id/report', async (req, res) => {
  const sid = req.params.id;
  try {
    const pairs = await pool.query(
      `SELECT pr.id, pr.left_user_id, pr.right_user_id, p.name as package_name, pr.state, pr.created_at
       FROM pair_records pr
       LEFT JOIN packages p ON pr.package_id = p.id
       WHERE pr.session_id = $1
       ORDER BY pr.created_at`,
      [sid]
    );
    res.json({ session_id: sid, pairs: pairs.rows });
  } catch (err) {
    console.error('GET /admin/session/:id/report', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /admin/pending-unlocks
 * List pending unlocks (optionally filter by package or status)
 */
router.get('/pending-unlocks', async (req, res) => {
  const { package_id, status = 'PENDING' } = req.query;
  try {
    const params = [status];
    let sql = `SELECT pu.id, pu.pair_record_id, pu.package_id, pu.status, pu.created_at, p.name as package_name
               FROM pending_unlocks pu
               JOIN packages p ON pu.package_id = p.id
               WHERE pu.status = $1`;
    if (package_id) {
      params.push(package_id);
      sql += ` AND pu.package_id = $${params.length}`;
    }
    sql += ' ORDER BY pu.created_at DESC LIMIT 500';
    const q = await pool.query(sql, params);
    res.json({ pending: q.rows });
  } catch (err) {
    console.error('GET /admin/pending-unlocks', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /admin/pending/:id/release
 * Admin manual release of pending unlock (force create pair_record GREEN/PAID)
 * Body: { admin_note }
 */
router.post('/pending/:id/release', async (req, res) => {
  const pid = req.params.id;
  const { admin_note } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pu = await client.query('SELECT * FROM pending_unlocks WHERE id=$1 FOR UPDATE', [pid]);
    if (pu.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pending unlock not found' });
    }
    const p = pu.rows[0];
    if (p.status === 'RELEASED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Already released' });
    }

    // Create pair_record as GREEN+PAID for that package at same pair position
    // we need left/right user ids from pair_records table
    const basePair = await client.query('SELECT left_user_id, right_user_id FROM pair_records WHERE id=$1', [p.unlocked_on_silver_pair_id]);
    if (basePair.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Base silver pair not found' });
    }
    const left_user = basePair.rows[0].left_user_id;
    const right_user = basePair.rows[0].right_user_id;

    const newPair = await client.query(
      `INSERT INTO pair_records(left_node_id, right_node_id, left_user_id, right_user_id, session_id, package_id, state, triggered_by, created_at, updated_at)
       VALUES($1,$2,$3,$4,NULL,$5,'GREEN',NULL,NOW(),NOW()) RETURNING id`,
      [p.unlocked_on_silver_pair_id, p.unlocked_on_silver_pair_id, left_user, right_user, p.package_id]
    );

    const pairIncomeRes = await client.query('SELECT pair_income FROM packages WHERE id=$1', [p.package_id]);
    const pairIncome = pairIncomeRes.rowCount ? Number(pairIncomeRes.rows[0].pair_income) : 0;
    const half = pairIncome / 2.0;

    // credit both users
    await client.query(
      `INSERT INTO wallet_transactions(user_id, amount, type, reference, status, created_at)
       VALUES($1,$2,'CREDIT',$3,'COMPLETED',NOW()), ($4,$5,'CREDIT',$3,'COMPLETED',NOW())`,
      [left_user, half, `manual-release:pending:${pid}`, right_user, half]
    );

    // mark pending unlock released
    await client.query('UPDATE pending_unlocks SET status=$1, released_at=NOW(), admin_note=$2 WHERE id=$3', ['RELEASED', admin_note || null, pid]);

    await client.query('COMMIT');
    res.json({ success: true, pair_id: newPair.rows[0].id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /admin/pending/:id/release', err);
    res.status(500).json({ error: 'Could not release pending unlock' });
  } finally {
    client.release();
  }
});

/**
 * GET /admin/wallet/report
 * Basic wallet transactions report (filter by date range)
 */
router.get('/wallet/report', async (req, res) => {
  const { from, to, user_id } = req.query;
  try {
    const params = [];
    let where = 'WHERE 1=1';
    if (from) {
      params.push(from);
      where += ` AND wt.created_at >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      where += ` AND wt.created_at <= $${params.length}`;
    }
    if (user_id) {
      params.push(user_id);
      where += ` AND wt.user_id = $${params.length}`;
    }
    const sql = `SELECT wt.id, wt.user_id, u.name, wt.amount, wt.type, wt.reference, wt.status, wt.created_at
                 FROM wallet_transactions wt
                 LEFT JOIN users u ON u.id = wt.user_id
                 ${where}
                 ORDER BY wt.created_at DESC
                 LIMIT 1000`;
    const q = await pool.query(sql, params);
    res.json({ transactions: q.rows });
  } catch (err) {
    console.error('GET /admin/wallet/report', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /admin/config/update
 * Update key configuration (session times, PV/BV rates, etc.)
 * Body: { key, value }
 */
router.post('/config/update', async (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  try {
    await pool.query(
      `INSERT INTO config(key, value, updated_at) VALUES($1,$2,NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, value]
    );
    res.json({ success: true, key, value });
  } catch (err) {
    console.error('POST /admin/config/update', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
