// backend/models/Franchise.js
import mongoose from "mongoose";

const { Schema, model } = mongoose;

/**
 * Franchise model
 * - owner: franchise holder (user id)
 * - referrer: user who referred this franchise (optional)
 * - minHolderPercent: minimum % of selling price the franchise holder gets (default 5)
 * - referrerPercent: % of BV given to referrer (default 1)
 * - products: list of product items managed by franchise (stock, price, bv, pv)
 * - sales: sale records for reporting (keeps minimal order info)
 * - totals: cached totals for quick queries (totalBV, totalPV, totalSales)
 *
 * Note: keep sale bookkeeping in services (franchiseService) that will call model helpers.
 */

const ProductItemSchema = new Schema({
  sku: { type: String, required: true }, // product identifier (unique per franchise preferred)
  title: { type: String, required: true },
  price: { type: Number, required: true, min: 0 }, // selling price (INR)
  bv: { type: Number, required: true, min: 0 }, // BV value for this product
  pv: { type: Number, required: true, min: 0 }, // PV value (if product gives PV)
  stock: { type: Number, default: 0, min: 0 }, // current stock available
  soldCount: { type: Number, default: 0, min: 0 },
  meta: { type: Schema.Types.Mixed, default: {} }
}, { _id: true, timestamps: false });

const SaleRecordSchema = new Schema({
  orderId: { type: Schema.Types.ObjectId, ref: "Order" },
  productSku: { type: String, required: true },
  productTitle: { type: String, required: true },
  price: { type: Number, required: true },
  bv: { type: Number, required: true },
  pv: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  soldBy: { type: Schema.Types.ObjectId, ref: "User" }, // user who sold / buyer (depending on flow)
  soldTo: { type: Schema.Types.ObjectId, ref: "User" }, // buyer id (optional)
  createdAt: { type: Date, default: () => new Date() }
}, { _id: true });

const FranchiseSchema = new Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, unique: true, index: true }, // franchise code
  owner: { type: Schema.Types.ObjectId, ref: "User", required: true }, // franchise holder (user)
  referrer: { type: Schema.Types.ObjectId, ref: "User", default: null }, // who referred franchise (optional)

  // percentages (plan: referrer 1% BV, franchise holder min 5% selling price)
  minHolderPercent: { type: Number, default: 5, min: 0 }, // percent of selling price payable to franchise holder
  referrerPercent: { type: Number, default: 1, min: 0 }, // percent of BV to referrer

  // product catalog managed by franchise
  products: { type: [ProductItemSchema], default: [] },

  // cumulative totals for quick queries
  totals: {
    totalBV: { type: Number, default: 0 },
    totalPV: { type: Number, default: 0 },
    totalSalesAmount: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 }
  },

  // sale log (recent sales / history)
  sales: { type: [SaleRecordSchema], default: [] },

  // configuration flags
  isActive: { type: Boolean, default: true },
  config: {
    productPercentOverrideAllowed: { type: Boolean, default: true }, // allow per-product percent override
    notes: { type: String, default: "" }
  },

  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() }
}, { timestamps: false });

// index for quick lookups
FranchiseSchema.index({ owner: 1 });
FranchiseSchema.index({ code: 1 });

// ---------- Instance / Static helpers ----------

/**
 * Record a sale for a product sku inside this franchise.
 * Decrements stock, increments soldCount, records sale, updates totals.
 * Returns the sale record object saved.
 *
 * Important: caller should run in a transaction when integrated with Order creation,
 * wallet updates, BV ledger crediting and referrer payouts.
 */
FranchiseSchema.methods.recordSale = async function({
  sku, quantity = 1, orderId = null, soldBy = null, soldTo = null
}) {
  const franchise = this;
  const prod = franchise.products.find(p => p.sku === sku);
  if (!prod) throw new Error("PRODUCT_NOT_FOUND");
  if (prod.stock < quantity) throw new Error("INSUFFICIENT_STOCK");

  // update product counters
  prod.stock -= quantity;
  prod.soldCount = (prod.soldCount || 0) + quantity;

  // compute totals
  const saleAmount = prod.price * quantity;
  const bvTotal = (prod.bv || 0) * quantity;
  const pvTotal = (prod.pv || 0) * quantity;

  // create sale record
  const saleRec = {
    orderId,
    productSku: prod.sku,
    productTitle: prod.title,
    price: prod.price,
    bv: prod.bv || 0,
    pv: prod.pv || 0,
    quantity,
    soldBy,
    soldTo,
    createdAt: new Date()
  };

  franchise.sales.push(saleRec);

  // update totals
  franchise.totals.totalSalesAmount = (franchise.totals.totalSalesAmount || 0) + saleAmount;
  franchise.totals.totalBV = (franchise.totals.totalBV || 0) + bvTotal;
  franchise.totals.totalPV = (franchise.totals.totalPV || 0) + pvTotal;
  franchise.totals.totalOrders = (franchise.totals.totalOrders || 0) + 1;

  franchise.updatedAt = new Date();

  await franchise.save();
  return saleRec;
};

/**
 * Add or update a product inside franchise.
 */
FranchiseSchema.methods.upsertProduct = async function(productObj) {
  const franchise = this;
  const { sku } = productObj;
  if (!sku) throw new Error("SKU_REQUIRED");
  const idx = franchise.products.findIndex(p => p.sku === sku);
  if (idx === -1) {
    franchise.products.push(productObj);
  } else {
    // merge allowed fields
    const p = franchise.products[idx];
    p.title = productObj.title ?? p.title;
    p.price = productObj.price ?? p.price;
    p.bv = productObj.bv ?? p.bv;
    p.pv = productObj.pv ?? p.pv;
    p.stock = (typeof productObj.stock === "number") ? productObj.stock : p.stock;
    p.meta = productObj.meta ?? p.meta;
  }
  franchise.updatedAt = new Date();
  await franchise.save();
  return franchise.products.find(p => p.sku === sku);
};

/**
 * Static helper: find franchise by code OR owner
 */
FranchiseSchema.statics.findByCode = function(code) {
  return this.findOne({ code });
};

FranchiseSchema.statics.findByOwner = function(ownerId) {
  return this.findOne({ owner: ownerId });
};

// export model
const Franchise = model("Franchise", FranchiseSchema);
export default Franchise;
