const router = require("express").Router();
const mongoose = require("mongoose");
const Cart = require("../models/cart");
const Order = require("../models/order");
const Product = require("../models/product");
const User = require("../models/user");
const { authenticate, requireAdmin } = require("../middleware/auth");

const DELIVERY_FEE = 200;
const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

function createOrderNumber() {
  return `NOVA-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function isValidOrderStatus(status) {
  return ORDER_STATUSES.includes(status);
}

async function restoreStock(orderItems) {
  for (const item of orderItems) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: item.quantity },
    });
  }
}

async function decreaseStockAndCreateOrderItems(cartItems) {
  const orderItems = [];
  const decreasedStock = [];

  try {
    for (const cartItem of cartItems) {
      const product = cartItem.product;
      if (!product || !product.isActive) {
        throw new Error("One or more cart products are unavailable");
      }

      const productWithReservedStock = await Product.findOneAndUpdate(
        { _id: product._id, isActive: true, stock: { $gte: cartItem.quantity } },
        { $inc: { stock: -cartItem.quantity } },
        { new: true }
      );
      if (!productWithReservedStock) {
        const stockError = new Error(`${product.name} is out of stock`);
        stockError.isStockError = true;
        throw stockError;
      }

      decreasedStock.push({ product: product._id, quantity: cartItem.quantity });
      orderItems.push({
        product: product._id,
        name: product.name,
        sku: product.sku,
        price: product.price,
        quantity: cartItem.quantity,
        image: product.images?.[0] || "",
      });
    }
    return { orderItems, decreasedStock };
  } catch (error) {
    await restoreStock(decreasedStock);
    throw error;
  }
}

function getShippingAddress(requestBody, user) {
  if (!user) {
    const error = new Error("User profile not found");
    error.isValidationError = true;
    throw error;
  }

  const shippingAddress = {
    fullName: requestBody.fullName === undefined ? user.fullName : requestBody.fullName,
    phoneNumber: requestBody.phoneNumber === undefined ? user.phoneNumber : requestBody.phoneNumber,
    city: requestBody.city === undefined ? user.city : requestBody.city,
    address: requestBody.address === undefined ? user.address : requestBody.address,
    deliveryInstructions: requestBody.deliveryInstructions === undefined
      ? user.deliveryInstructions || ""
      : requestBody.deliveryInstructions,
  };

  const requiredFields = ["fullName", "phoneNumber", "city", "address"];
  const hasInvalidField = requiredFields.some(
    (field) =>
      typeof shippingAddress[field] !== "string" ||
      !shippingAddress[field].trim()
  ) || typeof shippingAddress.deliveryInstructions !== "string";
  if (hasInvalidField) {
    const error = new Error("Complete shipping details are required");
    error.isValidationError = true;
    throw error;
  }
  return {
    ...shippingAddress,
    fullName: shippingAddress.fullName.trim(),
    phoneNumber: shippingAddress.phoneNumber.trim(),
    city: shippingAddress.city.trim(),
    address: shippingAddress.address.trim(),
    deliveryInstructions: shippingAddress.deliveryInstructions.trim(),
  };
}

router.use(authenticate);

router.post("/", async (req, res) => {
  let decreasedStock = [];
  let createdOrder;
  try {
    const user = await User.findById(req.user._id).select(
      "fullName phoneNumber city address deliveryInstructions"
    );
    const cart = await Cart.findOne({ user: req.user._id }).populate(
      "items.product",
      "name sku price stock images isActive"
    );

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const stockResult = await decreaseStockAndCreateOrderItems(cart.items);
    decreasedStock = stockResult.decreasedStock;
    const orderItems = stockResult.orderItems;
    const subtotal = orderItems.reduce(
      (total, item) => total + item.price * item.quantity,
      0
    );
    const shippingAddress = getShippingAddress(req.body || {}, user);

    createdOrder = await Order.create({
      orderNumber: createOrderNumber(),
      user: req.user._id,
      items: orderItems,
      subtotal,
      deliveryFee: DELIVERY_FEE,
      total: subtotal + DELIVERY_FEE,
      shippingAddress,
      paymentMethod: "cod",
    });

    const cartSnapshot = cart.items.map((item) => ({
      product: item.product._id || item.product,
      quantity: item.quantity,
    }));
    const clearedCart = await Cart.findOneAndUpdate(
      { _id: cart._id, items: cartSnapshot },
      { $set: { items: [] } }
    );
    if (!clearedCart) {
      const error = new Error("Cart changed while the order was being placed");
      error.isCartConflict = true;
      throw error;
    }

    res.status(201).json({ message: "Order placed successfully", order: createdOrder });
  } catch (error) {
    if (createdOrder) {
      try {
        const deletion = await Order.deleteOne({ _id: createdOrder._id });
        if (deletion.deletedCount !== 1) {
          console.error("Unable to roll back an order after cart update failure");
          return res.status(500).json({ message: "Unable to finalize order; contact support" });
        }
      } catch (rollbackError) {
        console.error("Order rollback failed:", rollbackError);
        return res.status(500).json({ message: "Unable to finalize order; contact support" });
      }
    }
    if (decreasedStock.length > 0) {
      await restoreStock(decreasedStock);
    }
    if (error.isStockError || error.isValidationError) {
      return res.status(400).json({ message: error.message });
    }
    if (error.isCartConflict) {
      return res.status(409).json({ message: "Cart changed; review it and try again" });
    }
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({ message: "Order details are invalid" });
    }
    res.status(500).json({ message: "Unable to place order" });
  }
});

router.get("/mine", async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json({ orders });
  } catch (error) {
    res.status(500).json({ message: "Unable to fetch orders" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid order id" });
    }
    const filter = req.user.role === "admin"
      ? { _id: req.params.id }
      : { _id: req.params.id, user: req.user._id };
    const order = await Order.findOne(filter).populate("user", "fullName email phoneNumber");
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.status(200).json({ order });
  } catch (error) {
    res.status(500).json({ message: "Unable to fetch order" });
  }
});

router.patch("/:id/cancel", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid order id" });
    }
    const order = await Order.findOneAndUpdate({
      _id: req.params.id,
      user: req.user._id,
      status: { $in: ["pending", "confirmed"] },
    }, {
      $set: { status: "cancelled", cancelledAt: new Date() },
    }, {
      new: true,
      runValidators: true,
    });
    if (!order) {
      return res.status(404).json({ message: "Order cannot be cancelled" });
    }
    await restoreStock(order.items);
    res.status(200).json({ message: "Order cancelled", order });
  } catch (error) {
    res.status(500).json({ message: "Unable to cancel order" });
  }
});

router.use(requireAdmin);

router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) {
      if (!isValidOrderStatus(req.query.status)) {
        return res.status(400).json({ message: "Invalid order status" });
      }
      filter.status = req.query.status;
    }
    const orders = await Order.find(filter)
      .populate("user", "fullName email phoneNumber")
      .sort({ createdAt: -1 });
    res.status(200).json({ orders });
  } catch (error) {
    res.status(500).json({ message: "Unable to fetch admin orders" });
  }
});

router.patch("/:id/status", async (req, res) => {
  try {
    const status = req.body?.status;
    if (!mongoose.isValidObjectId(req.params.id) || !isValidOrderStatus(status)) {
      return res.status(400).json({ message: "Valid order id and status are required" });
    }
    const currentOrder = await Order.findById(req.params.id);
    if (!currentOrder) return res.status(404).json({ message: "Order not found" });
    if (currentOrder.status === "cancelled" && status !== "cancelled") {
      return res.status(400).json({ message: "Cancelled order cannot be reopened" });
    }
    if (currentOrder.status === status) {
      return res.status(200).json({ message: "Order status updated", order: currentOrder });
    }
    if (status === "cancelled" && !["pending", "confirmed", "processing"].includes(currentOrder.status)) {
      return res.status(400).json({ message: "Shipped or delivered orders cannot be cancelled" });
    }

    const updates = { status };
    if (status === "cancelled") updates.cancelledAt = new Date();
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, status: currentOrder.status },
      updates,
      {
        new: true,
        runValidators: true,
      }
    ).populate("user", "fullName email phoneNumber");
    if (!order) {
      return res.status(409).json({ message: "Order status changed; reload and try again" });
    }
    if (status === "cancelled") {
      await restoreStock(order.items);
    }
    res.status(200).json({ message: "Order status updated", order });
  } catch (error) {
    res.status(500).json({ message: "Unable to update order status" });
  }
});

module.exports = router;
