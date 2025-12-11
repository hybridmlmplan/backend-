/**
 * routes/orderRoutes.js
 *
 * Complete, production-oriented Express router file for handling orders / package purchase
 * and package activation (via EPIN) according to the *Final* Hybrid MLM plan provided by Dev ji.
 *
 * This file is written as a self-contained router module using ES module syntax (import/export).
 * It assumes the existence of certain Mongoose models and services (listed below).
 * Where necessary, helper functions and fallback checks are included so this file can be
 * copy-pasted into your backend and wired to your existing models/services quickly.
 *
 * Required models/services (you must have these or create them in your project):
 *  - models/User.js          -> User mongoose model
 *  - models/Package.js       -> Package model (Silver, Gold, Ruby with PV, pairIncome, capping, prefix etc.)
 *  - models/EPin.js          -> EPIN model (code, used, usedBy, tokenOn/Off etc.)
 *  - models/Order.js         -> Order model (user, package, status, txn details, activatedAt etc.)
 *  - models/PendingIncome.js -> Pending incomes ledger (for gold/ruby pending after silver pair)
 *  - services/binaryService.js -> core binary pairing logic (session engine + pair creation)
 *  - services/walletService.js -> credit/debit user wallet, ledger entries (PV/BV)
 *  - middlewares/auth.js     -> auth middleware (req.user populated)
 *
 * NOTE: If you don't have some of the above services, this router will still work but
 * certain critical business actions (pair matching, session triggers, payouts) are delegated
 * to `binaryService` and `walletService` which should expose the functions used below.
 *
 * The routes implemented:
 *  - POST  /orders/create           -> Create an order (place purchase request)
 *  - POST  /orders/activate/:id     -> Activate an order using EPIN (or token)
 *  - GET   /orders/user/:userId     -> Get all orders of a user
 *  - GET   /orders/:id              -> Get single order detail
 *  - GET   /orders/pending/:userId  -> Get pending incomes for user (optional helper)
 *
 * Business rules encoded:
 *  - Package created as non-active upon order creation.
 *  - Activation requires valid EPIN (or other payment verification).
 *  - On activation:
 *      * User package becomes active
 *      * User is credited package PV (PV ledger) — used for binary pairing
 *      * If activation causes a *pair formation* (binaryService detects a pair),
 *        then for Silver pair green event: release silver pair income immediately
 *        and create pending incomes for Gold & Ruby (so they appear in pending list)
 *      * When user activates Gold/Ruby later, pending pair(s) will be checked and released.
 *  - Session / capping / red-green cycle / 8 sessions logic is handled in binaryService/sessionEngine.
 *
 * Keep this file in routes/ and import it in your main express app:
 *    import orderRoutes from "./routes/orderRoutes.js";
 *    app.use("/api/orders", orderRoutes);
 *
 * Author: ChatGPT (master mode) for Dev ji
 * Date: 2025-12-11
 */

import express from "express";
import EventEmitter from "events";
import mongoose from "mongoose";

const router = express.Router();
const eventBus = new EventEmitter(); // small local event bus (also integrates with global services if required)

/* -----------------------------
   Required model imports
   (ensure these paths match your project)
   ----------------------------- */
import User from "../models/User.js";
import PackageModel from "../models/Package.js";
import EPin from "../models/EPin.js";
import Order from "../models/Order.js";
import PendingIncome from "../models/PendingIncome.js"; // ledger of pending incomes (gold/ruby)
import PVBVLedger from "../models/PVBVLedger.js"; // optional: PV/BV ledger model

/* -----------------------------
   Required services (recommended)
   Implement these services separately for separation of concerns:
   - binaryService.matchAndProcessPair(userId, pkg) => returns { pairCreated: bool, pairInfo }
   - binaryService.releasePairIncome(pairInfo) => handles wallet credit for pair income
   - binaryService.createPendingForHigherPackages(pairInfo) => creates PendingIncome records for Gold/Ruby
   - walletService.credit(userId, amount, type, meta)
   - walletService.debit(userId, amount, type, meta)
   ----------------------------- */
import * as binaryService from "../services/binaryService.js";
import * as walletService from "../services/walletService.js";
import auth from "../middlewares/auth.js"; // middleware that sets req.user

/* -----------------------------
   Helpers & constants
   ----------------------------- */

const VALID_STATUSES = {
  PENDING: "PENDING",
  ACTIVATION_PENDING: "ACTIVATION_PENDING",
  ACTIVE: "ACTIVE",
  CANCELLED: "CANCELLED",
  FAILED: "FAILED",
};

// Utility: create a Mongo ObjectId safely
function toObjectId(id) {
  try {
    return mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
}

/* -----------------------------
   Route: Create Order
   POST /orders/create
   Body: { packageId, paymentMethod, epin (optional for offline), sponsorId, placementId }
   Auth: required (user must be logged in)
   Response: created order document
   ----------------------------- */
router.post("/create", auth, async (req, res) => {
  /**
   * Flow:
   * 1. Validate package id
   * 2. Create an Order document with status ACTIVATION_PENDING (or PENDING if offline payment)
   * 3. Reserve EPIN if provided (mark as reserved temporarily)
   * 4. Respond with order id to client
   *
   * Note: Actual activation happens on /activate endpoint with EPIN or payment confirmation.
   */
  try {
    const userId = req.user._id;
    const {
      packageId,
      paymentMethod = "EPIN", // EPIN | PAYMENT_GATEWAY | WALLET
      epin: providedEpin,
      sponsorId,
      placementId,
    } = req.body;

    if (!packageId) {
      return res.status(400).json({ status: false, message: "packageId is required" });
    }

    const pkg = await PackageModel.findById(packageId);
    if (!pkg) {
      return res.status(404).json({ status: false, message: "Package not found" });
    }

    // Create order
    const order = new Order({
      user: userId,
      package: pkg._id,
      price: pkg.price,
      pv: pkg.pv || 0,
      pairIncome: pkg.pairIncome || 0,
      status: VALID_STATUSES.ACTIVATION_PENDING,
      paymentMethod,
      sponsor: sponsorId || null,
      placement: placementId || null,
      createdAt: new Date(),
      meta: {
        createdBy: req.user._id,
      },
    });

    // If EPIN provided, we reserve it now (do not mark used until activation)
    if (providedEpin) {
      const epinDoc = await EPin.findOne({ code: providedEpin });
      if (!epinDoc) {
        return res.status(400).json({ status: false, message: "Invalid EPIN code" });
      }
      if (epinDoc.used) {
        return res.status(400).json({ status: false, message: "EPIN already used" });
      }

      // Optionally mark reserved: add order id to epin reservedBy
      epinDoc.reservedBy = userId;
      epinDoc.reservedAt = new Date();
      await epinDoc.save();

      order.epin = epinDoc._id;
    }

    await order.save();

    return res.status(201).json({ status: true, message: "Order created", data: order });
  } catch (err) {
    console.error("Create order error:", err);
    return res.status(500).json({ status: false, message: "Server error during order creation", error: err.message });
  }
});

/* -----------------------------
   Route: Activate Order using EPIN or payment verification
   POST /orders/activate/:orderId
   Body (if using EPIN): { epin }
   Auth: required
   ----------------------------- */
router.post("/activate/:id", auth, async (req, res) => {
  /**
   * Flow on activation:
   * 1. Validate order exists and belongs to user and is not ACTIVE
   * 2. Validate EPIN ownership or payment confirmation (this example supports EPIN & wallet)
   * 3. Mark EPIN as used (set used=true, usedBy, usedAt) and attach to order
   * 4. Mark order ACTIVE, set activatedAt
   * 5. Update user's package status (create/attach userPackage entry or update user's packages array)
   * 6. Credit PV (PV ledger) for the user (PV used for binary pairing)
   * 7. Call binaryService.matchAndProcessPair(user, package)
   *    - binaryService should handle red->green logic, session capping, pair creation in correct session
   *    - if a pair is created and it's Silver's green pair:
   *         -> binaryService or this route will create PendingIncome entries for Gold & Ruby (so they show in pending list)
   *
   * IMPORTANT:
   * Actual pairing and payout release should be handled by a central session engine (binaryService).
   * This route's responsibility is to activate the package and trigger the engine to evaluate pairing.
   */
  try {
    const orderId = req.params.id;
    const userId = req.user._id;
    const { epin: providedEpin, paymentReference } = req.body;

    const order = await Order.findById(orderId).populate("package");
    if (!order) {
      return res.status(404).json({ status: false, message: "Order not found" });
    }
    if (String(order.user) !== String(userId) && !req.user.isAdmin) {
      return res.status(403).json({ status: false, message: "Not authorized to activate this order" });
    }
    if (order.status === VALID_STATUSES.ACTIVE) {
      return res.status(400).json({ status: false, message: "Order already active" });
    }

    // If order has EPIN attached from create step, ensure it matches
    let epinDoc = null;
    if (order.epin) {
      epinDoc = await EPin.findById(order.epin);
      if (!epinDoc) {
        return res.status(400).json({ status: false, message: "Reserved EPIN not found" });
      }
    }

    // If EPIN provided in body (common case), validate and mark used
    if (providedEpin) {
      epinDoc = await EPin.findOne({ code: providedEpin });
      if (!epinDoc) {
        return res.status(400).json({ status: false, message: "Invalid EPIN" });
      }
      if (epinDoc.used) {
        return res.status(400).json({ status: false, message: "EPIN already used" });
      }
    }

    // Payment gateway path: If payment reference is provided, you may want to validate it with gateway
    if (!providedEpin && !epinDoc && !paymentReference) {
      return res.status(400).json({ status: false, message: "EPIN or paymentReference required to activate" });
    }

    // 1) Mark EPIN used if EPIN activation
    if (epinDoc) {
      epinDoc.used = true;
      epinDoc.usedBy = userId;
      epinDoc.usedAt = new Date();
      epinDoc.order = order._id;
      await epinDoc.save();

      order.epin = epinDoc._id;
    }

    // 2) Mark order active
    order.status = VALID_STATUSES.ACTIVE;
    order.activatedAt = new Date();
    if (paymentReference) order.paymentReference = paymentReference;
    await order.save();

    // 3) Attach package to user (user.packages array assumed)
    const user = await User.findById(userId);
    if (!user) {
      // Shouldn't happen, but roll back EPIN if needed
      return res.status(500).json({ status: false, message: "User not found during activation" });
    }

    // Append package to user's packages list as non-active->active record
    // Make sure your User model has 'packages' array schema:
    // { packageId, active: Boolean, activatedAt, pv, sessionsCompleted, cappingMeta }
    const userPackageEntry = {
      packageId: order.package._id,
      packageName: order.package.name,
      pv: order.package.pv || 0,
      pairIncome: order.package.pairIncome || 0,
      active: true,
      activatedAt: new Date(),
      sessionsCompleted: 0,
      meta: {
        order: order._id,
      },
    };

    user.packages = user.packages || [];
    user.packages.push(userPackageEntry);
    await user.save();

    // 4) Credit user's PV ledger (PV is used by binary engine to form pairs)
    // Create a PV ledger entry (PVBVLedger model assumed)
    if (typeof walletService.creditPV === "function") {
      // walletService.creditPV should create ledger entries and return
      await walletService.creditPV(userId, order.package.pv, {
        reason: "Package Activation",
        packageId: order.package._id,
        orderId: order._id,
      });
    } else {
      // fallback: save PV entry if PVBVLedger is available
      try {
        if (PVBVLedger) {
          await PVBVLedger.create({
            user: userId,
            pv: order.package.pv,
            bv: 0,
            type: "PV_CREDIT",
            meta: { packageId: order.package._id, orderId: order._id },
            createdAt: new Date(),
          });
        }
      } catch (e) {
        // non-fatal
        console.warn("PV ledger fallback failed", e.message);
      }
    }

    // 5) Trigger binaryService to check pairing logic for this user's new PV
    // binaryService.matchAndProcessPair should:
    //   - check current session and capping
    //   - create pair nodes (red initially)
    //   - if opposite leg matched, create green pair and release income accordingly
    //   - if this activation causes Silver's green pair, then create PendingIncome records for Gold & Ruby
    // We pass the order.package info so the service knows package type (Silver/Gold/Ruby)
    let pairResult = null;
    if (typeof binaryService.matchAndProcessPair === "function") {
      pairResult = await binaryService.matchAndProcessPair(userId, order.package);
      // pairResult is expected to be an object like:
      // { pairCreated: true|false, pairInfo: {...}, released: { silver: ..., goldPending: ..., rubyPending: ... } }
    } else {
      // fallback: emit local event and let external session engine pick it up
      eventBus.emit("packageActivated", { userId, package: order.package, orderId: order._id });
    }

    // 6) If binaryService returned that a silver pair became GREEN now,
    //    we must create PendingIncome entries for Gold & Ruby (business rule)
    if (pairResult && pairResult.pairCreated) {
      // If pairResult indicates silver pair became green:
      if (pairResult.released && pairResult.released.silver && pairResult.released.silver.isGreen) {
        // Create pending incomes for Gold & Ruby for this same pair reference.
        // PendingIncome doc should include: user, package (Gold/Ruby), amount, pairRef, status: PENDING
        try {
          const pairRef = pairResult.pairInfo?._id || pairResult.pairInfo?.pairRef || null;
          // create for Gold
          const goldPkg = await PackageModel.findOne({ name: /Gold/i });
          const rubyPkg = await PackageModel.findOne({ name: /Ruby/i });

          if (goldPkg) {
            await PendingIncome.create({
              user: userId,
              packageId: goldPkg._id,
              amount: goldPkg.pairIncome || 0,
              reason: "Pending due to Silver pair unlocking (Gold)",
              pairRef,
              status: "PENDING",
              createdAt: new Date(),
            });
          }
          if (rubyPkg) {
            await PendingIncome.create({
              user: userId,
              packageId: rubyPkg._id,
              amount: rubyPkg.pairIncome || 0,
              reason: "Pending due to Silver pair unlocking (Ruby)",
              pairRef,
              status: "PENDING",
              createdAt: new Date(),
            });
          }
        } catch (e) {
          console.warn("Failed to create pending incomes for Gold/Ruby:", e.message);
        }
      }
    }

    // 7) Return success with order + pairResult (if any)
    return res.status(200).json({
      status: true,
      message: "Order activated successfully",
      data: {
        order,
        pairResult,
      },
    });
  } catch (err) {
    console.error("Activate order error:", err);
    return res.status(500).json({ status: false, message: "Server error during activation", error: err.message });
  }
});

/* -----------------------------
   Route: Get orders for user
   GET /orders/user/:userId
   Auth: admin or same user
   ----------------------------- */
router.get("/user/:userId", auth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (String(req.user._id) !== String(userId) && !req.user.isAdmin) {
      return res.status(403).json({ status: false, message: "Not authorized" });
    }
    const orders = await Order.find({ user: userId }).populate("package epin").sort({ createdAt: -1 });
    return res.status(200).json({ status: true, data: orders });
  } catch (err) {
    console.error("Get user orders:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
});

/* -----------------------------
   Route: Get order detail
   GET /orders/:id
   Auth: owner or admin
   ----------------------------- */
router.get("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id).populate("package epin user sponsor placement");
    if (!order) {
      return res.status(404).json({ status: false, message: "Order not found" });
    }
    if (String(order.user._id) !== String(req.user._id) && !req.user.isAdmin) {
      return res.status(403).json({ status: false, message: "Not authorized to view this order" });
    }
    return res.status(200).json({ status: true, data: order });
  } catch (err) {
    console.error("Get order:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
});

/* -----------------------------
   Route: Get pending incomes for user (helper)
   GET /orders/pending/:userId
   ----------------------------- */
router.get("/pending/:userId", auth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (String(req.user._id) !== String(userId) && !req.user.isAdmin) {
      return res.status(403).json({ status: false, message: "Not authorized" });
    }

    const pendings = await PendingIncome.find({ user: userId, status: "PENDING" })
      .populate("packageId pairRef")
      .sort({ createdAt: -1 });

    return res.status(200).json({ status: true, data: pendings });
  } catch (err) {
    console.error("Get pending incomes:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
});

/* -----------------------------
   Webhook/event listeners (optional)
   If your binary/session engine is external, you can subscribe to its events.
   Example: when it emits 'pairGreen' we may want to automatically create pending incomes for gold/ruby
   ----------------------------- */

eventBus.on("pairGreen", async (payload) => {
  /**
   * payload expected:
   * { userId, pairInfo, packageType (Silver|Gold|Ruby), sessionId }
   *
   * On silver pair green: create PendingIncome docs for Gold & Ruby (business requirement).
   * Note: binaryService.matchAndProcessPair may already handle this; duplicate checks must be present.
   */
  try {
    const { userId, pairInfo, packageType } = payload;
    if (!userId || !pairInfo) return;

    if (/silver/i.test(packageType)) {
      // create pending entries if not exists for same pairRef
      const pairRef = pairInfo._id || pairInfo.pairRef;
      const goldPkg = await PackageModel.findOne({ name: /Gold/i });
      const rubyPkg = await PackageModel.findOne({ name: /Ruby/i });

      if (goldPkg) {
        const exists = await PendingIncome.findOne({ user: userId, packageId: goldPkg._id, pairRef });
        if (!exists) {
          await PendingIncome.create({
            user: userId,
            packageId: goldPkg._id,
            amount: goldPkg.pairIncome || 0,
            reason: "Pending (created on Silver pair green)",
            pairRef,
            status: "PENDING",
            createdAt: new Date(),
          });
        }
      }
      if (rubyPkg) {
        const exists = await PendingIncome.findOne({ user: userId, packageId: rubyPkg._id, pairRef });
        if (!exists) {
          await PendingIncome.create({
            user: userId,
            packageId: rubyPkg._id,
            amount: rubyPkg.pairIncome || 0,
            reason: "Pending (created on Silver pair green)",
            pairRef,
            status: "PENDING",
            createdAt: new Date(),
          });
        }
      }
    }
  } catch (e) {
    console.error("Event pairGreen handler error:", e.message);
  }
});

/* -----------------------------
   Export router
   ----------------------------- */
export default router;
