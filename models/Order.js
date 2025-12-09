// models/Order.js
import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Orders for products/services
 * Generates BV and PV
 * BV used for level/fund/royalty income
 * PV used for binary activation
 */

const OrderProductSchema = new Schema({
  productId: { type: String },
  name: { type: String },
  qty: { type: Number, default: 1 },
  price: { type: Number, default: 0 },
  bv: { type: Number, default: 0 },
  pv: { type: Number, default: 0 },
}, { _id: false });

const OrderSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },

  items: { type: [OrderProductSchema], default: [] },

  totalPrice: { type: Number, default: 0 },
  totalBV: { type: Number, default: 0 },
  totalPV: { type: Number, default: 0 },

  franchise: { type: Schema.Types.ObjectId, ref: "Franchise" }, // optional

  processed: { type: Boolean, default: false },
  processedAt: { type: Date },

  createdAt: { type: Date, default: Date.now },
});

OrderSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("Order", OrderSchema);
