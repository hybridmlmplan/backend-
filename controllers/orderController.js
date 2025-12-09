import { processOrder } from "../services/orderService.js";

export const createOrder = async (req, res) => {
  try {
    const { userId, amount, pv, bv } = req.body;

    if (!userId || !amount || !pv || !bv) {
      return res.json({ status: false, message: "Missing fields" });
    }

    const data = await processOrder(userId, amount, pv, bv);

    return res.json({ status: true, message: "Order processed", data });
  } catch (err) {
    return res.json({ status: false, message: err.message });
  }
};
