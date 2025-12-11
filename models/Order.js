// backend/models/Order.js
import mongoose from "mongoose";
const { Schema, model } = mongoose;

/**
 * Order model
 * - supports: package purchase (silver/gold/ruby), product orders, franchise sales
 * - tracks PV/BV, EPIN usage, referral/franchise attribution, transactions, status history
 */

const OrderItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: false }, // optional for package buy
  packageCode: { type: String, enum: ["silver", "gold", "ruby"], required: false }, // for package purchases
  name: { type: String, required: true },
  qty: { type: Number, default: 1 },
  price: { type: Number, default: 0 }, // INR
  bv: { type: Number, default: 0 }, // BV for this item (if any)
  pv: { type: Number, default: 0 }, // PV for this item (if any)
  meta: { type: Schema.Types.Mixed } // any extra data
}, { _id: false });

const StatusLogSchema = new Schema({
  status: { type: String, enum: ["pending", "paid", "processing", "completed", "cancelled", "failed", "refunded"], required: true },
  note: { type: String },
  by: { type: Schema.Types.ObjectId, ref: "User", required: false },
  at: { type: Date, default: Date.now }
}, { _id: false });

const OrderSchema = new Schema({
  orderNumber: { type: String, index: true, unique: true }, // e.g. ORDYYYYMMDDxxxx
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },

  // items can be package(s) or products
  items: { type: [OrderItemSchema], required: true },

  // totals
  subTotal: { type: Number, default: 0 }, // sum prices
  tax: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 }, // INR

  // BV/PV: totals derived from items
  totalBV: { type: Number, default: 0 },
  totalPV: { type: Number, default: 0 },

  // If EPIN activation was used to activate a package
  epinUsed: { type: Schema.Types.ObjectId, ref: "EPIN", required: false },
  epinCode: { type: String, required: false }, // denormalized for quick lookup

  // Payment & transaction info
  paymentMethod: { type: String, enum: ["wallet", "razorpay", "paytm", "upi", "bank_transfer", "cod", "external"], default: "wallet" },
  transactionId: { type: String },
  paymentStatus: { type: String, enum: ["unpaid", "paid", "failed", "refunded"], default: "unpaid" },

  // For franchise/referrer commission attribution
  franchiseId: { type: Schema.Types.ObjectId, ref: "Franchise", required: false },
  referrerId: { type: Schema.Types.ObjectId, ref: "User", required: false },

  // Flags for processing
  isBVCredited: { type: Boolean, default: false }, // whether BV ledger updated
  isPVCredited: { type: Boolean, default: false }, // whether PV entries added (binary tree)
  isPairCreated: { type: Boolean, default: false }, // whether binary pair nodes created for this order

  status: { type: String, enum: ["pending", "paid", "processing", "completed", "cancelled", "failed", "refunded"], default: "pending" },
  statusLog: { type: [StatusLogSchema], default: [] },

  // admin notes / meta
  adminNote: { type: String, default: "" },
  meta: { type: Schema.Types.Mixed },

  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});

// ------------------------------
// Indexes
// ------------------------------
OrderSchema.index({ user: 1, createdAt: -1 });
OrderSchema.index({ orderNumber: 1 });

// ------------------------------
// Pre-save hook: set timestamps
// ------------------------------
OrderSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  if (!this.orderNumber) {
    // simple order number generator: ORD + timestamp + random
    const ts = new Date().toISOString().replace(/[-:TZ.]/g, "");
    const rnd = Math.floor(1000 + Math.random() * 9000);
    this.orderNumber = `ORD${ts}${rnd}`;
  }
  next();
});

// ------------------------------
// Instance helpers
// ------------------------------
OrderSchema.methods.addStatus = function (status, note = "", by = null) {
  this.status = status;
  this.statusLog.push({ status, note, by, at: new Date() });
  return this.save();
};

// compute totals from items (can be called before save in controller)
OrderSchema.methods.recalculateTotals = function () {
  const subTotal = (this.items || []).reduce((s, it) => s + (Number(it.price || 0) * Number(it.qty || 1)), 0);
  const totalBV = (this.items || []).reduce((s, it) => s + (Number(it.bv || 0) * Number(it.qty || 1)), 0);
  const totalPV = (this.items || []).reduce((s, it) => s + (Number(it.pv || 0) * Number(it.qty || 1)), 0);

  this.subTotal = subTotal;
  this.totalBV = totalBV;
  this.totalPV = totalPV;

  // simple totalAmount = subTotal - discount + tax
  this.totalAmount = Number(subTotal) - Number(this.discount || 0) + Number(this.tax || 0);
  return {
    subTotal: this.subTotal,
    totalBV: this.totalBV,
    totalPV: this.totalPV,
    totalAmount: this.totalAmount
  };
};

// mark BV/PV credited flags (used by ledger scripts)
OrderSchema.methods.markBVCredited = async function () {
  this.isBVCredited = true;
  return this.save();
};

OrderSchema.methods.markPVCredited = async function () {
  this.isPVCredited = true;
  return this.save();
};

// ------------------------------
// Statics: create order for package purchase (helper)
// ------------------------------
OrderSchema.statics.createPackageOrder = async function ({ userId, packageCode, packageConfig, epin = null, referrerId = null, franchiseId = null, meta = {} }) {
  // packageConfig = { price, pv, bv, name }
  const Item = {
    name: packageConfig.name || `${packageCode} package`,
    packageCode,
    qty: 1,
    price: packageConfig.price || 0,
    bv: packageConfig.bv || 0,
    pv: packageConfig.pv || 0
  };

  const order = new this({
    user: userId,
    items: [Item],
    epinUsed: epin ? epin._id : undefined,
    epinCode: epin ? (epin.code || epin._id) : undefined,
    referrerId,
    franchiseId,
    meta
  });

  order.recalculateTotals();
  // status pending by default
  await order.save();
  return order;
};

export default model("Order", OrderSchema);
