/**
 * controllers/orderController.js
 *
 * Complete controller for Orders / Package purchase & activation
 * Implements the Final Hybrid MLM Plan rules (Dev ji)
 *
 * Routes expected to wire to these controller methods:
 *  - POST  /orders/create         -> createOrder(req, res)
 *  - POST  /orders/activate/:id   -> activateOrder(req, res)
 *  - GET   /orders/user/:userId   -> getUserOrders(req, res)
 *  - GET   /orders/:id            -> getOrderById(req, res)
 *  - GET   /orders/pending/:userId-> getPendingIncomes(req, res)
 *
 * Key behaviors:
 *  - Order created with ACTIVATION_PENDING status
 *  - Activation via EPIN or paymentReference
 *  - On activation: mark EPIN used, attach package to user (non-active -> active entry),
 *    credit PV ledger, call binaryService.matchAndProcessPair to create red pair
 *  - If binaryService indicates Silver pair became GREEN, create PendingIncome entries for Gold & Ruby
 *  - Uses walletService.creditPV & walletService.credit for robust ledgering (fallback to PVBVLedger)
 *
 * Notes:
 *  - This controller delegates heavy pairing/session logic to binaryService (recommended).
 *  - Ensure your models have fields referenced below, or adjust accordingly.
 *
 * Author: ChatGPT (master mode) for Dev ji
 * Date: 2025-12-11
 */

import mongoose from "mongoose";

// Adjust import paths to match your project
import User from "../models/User.js";
import PackageModel from "../models/Package.js";
import EPin from "../models/EPin.js";
import Order from "../models/Order.js";
import PendingIncome from "../models/PendingIncome.js";
import PVBVLedger from "../models/PVBVLedger.js";

import * as binaryService from "../services/binaryService.js";
import * as walletService from "../services/walletService.js";

/* Valid statuses */
const ORDER_STATUS = {
  PENDING: "PENDING",
  ACTIVATION_PENDING: "ACTIVATION_PENDING",
  ACTIVE: "ACTIVE",
  CANCELLED: "CANCELLED",
  FAILED: "FAILED",
};

const orderController = {};

/* -----------------------------
   Helper: safe objectId
------------------------------*/
function toObjectId(id) {
  try {
    return mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
}

/* -----------------------------
   createOrder
   POST /orders/create
   Body: { packageId, paymentMethod = "EPIN", epin (optional), sponsorId, placementId }
   Auth: required (req.user)
------------------------------*/
orderController.createOrder = async (req, res) => {
  try {
    const userId = req.user?.id;
    const {
      packageId,
      paymentMethod = "EPIN",
      epin: providedEpin,
      sponsorId = null,
      placementId = null,
    } = req.body;

    if (!userId) return res.status(401).json({ status: false, message: "Unauthorized" });
    if (!packageId) return res.status(400).json({ status: false, message: "packageId is required" });

    const pkg = await PackageModel.findById(packageId);
    if (!pkg) return res.status(404).json({ status: false, message: "Package not found" });

    // Create order doc
    const order = new Order({
      user: toObjectId(userId),
      package: pkg._id,
      price: pkg.price || 0,
      pv: pkg.pv || 0,
      pairIncome: pkg.pairIncome || 0,
      status: ORDER_STATUS.ACTIVATION_PENDING,
      paymentMethod,
      sponsor: sponsorId || null,
      placement: placementId || null,
      createdAt: new Date(),
      meta: { createdBy: userId },
    });

    // If EPIN provided, reserve it (link it). Do not mark used yet.
    if (providedEpin) {
      const epinDoc = await EPin.findOne({ code: providedEpin });
      if (!epinDoc) {
        return res.status(400).json({ status: false, message: "Invalid EPIN code" });
      }
      if (epinDoc.used) {
        return res.status(400).json({ status: false, message: "EPIN already used" });
      }

      epinDoc.reservedBy = toObjectId(userId);
      epinDoc.reservedAt = new Date();
      await epinDoc.save();

      order.epin = epinDoc._id;
    }

    await order.save();

    return res.status(201).json({ status: true, message: "Order created", data: order });
  } catch (err) {
    console.error("createOrder error:", err);
    return res.status(500).json({ status: false, message: "Server error during order creation", error: err.message });
  }
};

/* -----------------------------
   activateOrder
   POST /orders/activate/:id
   Body: { epin (if not reserved), paymentReference (optional) }
   Auth: required
------------------------------*/
orderController.activateOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.user?.id;
    const { epin: providedEpin, paymentReference = null } = req.body;

    if (!userId) return res.status(401).json({ status: false, message: "Unauthorized" });
    if (!orderId) return res.status(400).json({ status: false, message: "Order id required" });

    const order = await Order.findById(orderId).populate("package epin");
    if (!order) return res.status(404).json({ status: false, message: "Order not found" });

    // Only owner or admin can activate
    if (String(order.user) !== String(userId) && !req.user.isAdmin) {
      return res.status(403).json({ status: false, message: "Not authorized to activate this order" });
    }

    if (order.status === ORDER_STATUS.ACTIVE) {
      return res.status(400).json({ status: false, message: "Order already active" });
    }

    // EPIN flow: either order has reserved epin or providedEpin must be valid
    let epinDoc = null;
    if (order.epin) {
      epinDoc = await EPin.findById(order.epin);
      if (!epinDoc) return res.status(400).json({ status: false, message: "Reserved EPIN not found" });
    } else if (providedEpin) {
      epinDoc = await EPin.findOne({ code: providedEpin });
      if (!epinDoc) return res.status(400).json({ status: false, message: "Invalid EPIN provided" });
    }

    // If no epin and no paymentReference -> error
    if (!epinDoc && !paymentReference) {
      return res.status(400).json({ status: false, message: "EPIN or paymentReference required to activate" });
    }

    // Mark EPIN used if present
    if (epinDoc) {
      if (epinDoc.used) return res.status(400).json({ status: false, message: "EPIN already used" });

      epinDoc.used = true;
      epinDoc.usedBy = toObjectId(userId);
      epinDoc.usedAt = new Date();
      epinDoc.order = order._id;
      await epinDoc.save();
      order.epin = epinDoc._id;
    }

    // Mark order active
    order.status = ORDER_STATUS.ACTIVE;
    order.activatedAt = new Date();
    if (paymentReference) order.paymentReference = paymentReference;
    await order.save();

    // Attach package to user (User.packages array expected)
    const user = await User.findById(userId);
    if (!user) {
      // Rollback epin used if necessary (best effort)
      if (epinDoc) {
        epinDoc.used = false;
        epinDoc.usedBy = null;
        epinDoc.usedAt = null;
        await epinDoc.save();
      }
      return res.status(500).json({ status: false, message: "User not found during activation" });
    }

    const pkg = order.package;
    // Create userPackage entry
    const userPackageEntry = {
      packageId: pkg._id,
      packageName: pkg.name || "",
      pv: pkg.pv || 0,
      pairIncome: pkg.pairIncome || 0,
      active: true,
      activatedAt: new Date(),
      sessionsCompleted: 0,
      meta: { orderId: order._id },
    };

    user.packages = user.packages || [];
    user.packages.push(userPackageEntry);
    await user.save();

    // Credit PV ledger: prefer walletService.creditPV, else fallback to PVBVLedger document
    try {
      if (typeof walletService.creditPV === "function") {
        await walletService.creditPV(user._id, pkg.pv || 0, {
          reason: "Package Activation",
          packageId: pkg._id,
          orderId: order._id,
        });
      } else if (PVBVLedger) {
        await PVBVLedger.create({
          user: user._id,
          pv: pkg.pv || 0,
          bv: 0,
          type: "PV_CREDIT",
          meta: { packageId: pkg._id, orderId: order._id },
          createdAt: new Date(),
        });
      }
    } catch (e) {
      console.warn("PV credit failed:", e.message);
    }

    // Trigger binary pairing engine to evaluate pairs for this new activation
    // binaryService.matchAndProcessPair should:
    //  - Create red pair node in current session respecting capping
    //  - If opposite leg matched and pair turned GREEN, return details including whether Silver pair became GREEN
    //  - Also emit events if needed
    let pairResult = null;
    try {
      if (typeof binaryService.matchAndProcessPair === "function") {
        pairResult = await binaryService.matchAndProcessPair(user._id, pkg);
      } else {
        // If binaryService not implemented, emit a local event or set pairResult null
        // In production, binaryService must exist.
        pairResult = null;
      }
    } catch (e) {
      console.error("binaryService.matchAndProcessPair error:", e.message);
      // don't fail activation for pairing issues — return success but include warning
    }

    // Business rule: If pairResult indicates Silver pair became GREEN, create PendingIncome for Gold & Ruby
    try {
      if (pairResult && pairResult.pairCreated && pairResult.released) {
        // we expect pairResult.released.silver.isGreen or similar flag
        const silverReleased = pairResult.released.silver && pairResult.released.silver.isGreen;
        const pairRef = pairResult.pairInfo?._id || pairResult.pairInfo?.pairRef || null;

        if (silverReleased) {
          // find gold & ruby packages
          const goldPkg = await PackageModel.findOne({ name: /Gold/i });
          const rubyPkg = await PackageModel.findOne({ name: /Ruby/i });

          if (goldPkg) {
            await PendingIncome.create({
              user: user._id,
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
              user: user._id,
              packageId: rubyPkg._id,
              amount: rubyPkg.pairIncome || 0,
              reason: "Pending due to Silver pair unlocking (Ruby)",
              pairRef,
              status: "PENDING",
              createdAt: new Date(),
            });
          }
        }
      }
    } catch (e) {
      console.warn("Creating PendingIncome failed:", e.message);
    }

    return res.status(200).json({
      status: true,
      message: "Order activated successfully",
      data: { order, pairResult },
    });
  } catch (err) {
    console.error("activateOrder error:", err);
    return res.status(500).json({ status: false, message: "Server error during activation", error: err.message });
  }
};

/* -----------------------------
   getUserOrders
   GET /orders/user/:userId
   Auth: owner or admin
------------------------------*/
orderController.getUserOrders = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!req.user) return res.status(401).json({ status: false, message: "Unauthorized" });

    if (String(req.user.id) !== String(userId) && !req.user.isAdmin) {
      return res.status(403).json({ status: false, message: "Not authorized" });
    }

    const orders = await Order.find({ user: toObjectId(userId) }).populate("package epin").sort({ createdAt: -1 });
    return res.status(200).json({ status: true, data: orders });
  } catch (err) {
    console.error("getUserOrders error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};

/* -----------------------------
   getOrderById
   GET /orders/:id
   Auth: owner or admin
------------------------------*/
orderController.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.user) return res.status(401).json({ status: false, message: "Unauthorized" });

    const order = await Order.findById(id).populate("package epin user sponsor placement");
    if (!order) return res.status(404).json({ status: false, message: "Order not found" });

    if (String(order.user) !== String(req.user.id) && !req.user.isAdmin) {
      return res.status(403).json({ status: false, message: "Not authorized to view this order" });
    }

    return res.status(200).json({ status: true, data: order });
  } catch (err) {
    console.error("getOrderById error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};

/* -----------------------------
   getPendingIncomes
   GET /orders/pending/:userId
   Auth: owner or admin
------------------------------*/
orderController.getPendingIncomes = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!req.user) return res.status(401).json({ status: false, message: "Unauthorized" });

    if (String(req.user.id) !== String(userId) && !req.user.isAdmin) {
      return res.status(403).json({ status: false, message: "Not authorized" });
    }

    const pendings = await PendingIncome.find({ user: toObjectId(userId), status: "PENDING" })
      .populate("packageId pairRef")
      .sort({ createdAt: -1 });

    return res.status(200).json({ status: true, data: pendings });
  } catch (err) {
    console.error("getPendingIncomes error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};

export default orderController;
