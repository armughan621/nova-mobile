const router = require("express").Router();
const mongoose = require("mongoose");
const Cart = require("../models/cart");
const Product = require("../models/product");
const { authenticate } = require("../middleware/auth");

router.use(authenticate);

async function getCart(userId) {
  const cart = await Cart.findOne({ user: userId }).populate(
    "items.product",
    "name slug sku price stock images isActive"
  );
  return cart || { user: userId, items: [] };
}

function isValidQuantity(quantity) {
  return Number.isSafeInteger(quantity) && quantity > 0;
}

function isValidProductId(productId) {
  return mongoose.isValidObjectId(productId);
}

async function findActiveProduct(productId) {
  return Product.findOne({ _id: productId, isActive: true }).select("stock");
}

router.get("/", async (req, res) => {
  try {
    res.status(200).json({ cart: await getCart(req.user._id) });
  } catch (error) {
    res.status(500).json({ message: "Unable to fetch cart" });
  }
});

router.post("/items", async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body || {};
    if (!isValidProductId(productId) || !isValidQuantity(quantity)) {
      return res.status(400).json({
        message: "A valid productId and a positive whole-number quantity are required",
      });
    }

    const product = await findActiveProduct(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const existingCart = await Cart.findOneAndUpdate(
      { user: req.user._id, "items.product": productId },
      { $inc: { "items.$.quantity": quantity } },
      { new: true }
    );

    if (!existingCart) {
      const cartWithNewItem = await Cart.findOneAndUpdate(
        { user: req.user._id },
        { $push: { items: { product: productId, quantity } } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      const addedItem = cartWithNewItem.items.find(
        (item) => item.product.toString() === productId
      );
      if (addedItem.quantity > product.stock) {
        await removeProductFromCart(req.user._id, productId);
        return res.status(400).json({ message: "Requested quantity is not available in stock" });
      }
    } else {
      const item = existingCart.items.find(
        (entry) => entry.product.toString() === productId
      );
      if (item.quantity > product.stock) {
        if (product.stock === 0) {
          await removeProductFromCart(req.user._id, productId);
          return res.status(400).json({ message: "Product is out of stock" });
        }
        await setCartItemQuantity(req.user._id, productId, product.stock);
        return res.status(400).json({ message: "Requested quantity is not available in stock" });
      }
    }

    res.status(200).json({ cart: await getCart(req.user._id) });
  } catch (error) {
    res.status(500).json({ message: "Unable to add product to cart" });
  }
});

async function removeProductFromCart(userId, productId) {
  await Cart.updateOne(
    { user: userId },
    { $pull: { items: { product: productId } } }
  );
}

async function setCartItemQuantity(userId, productId, quantity) {
  await Cart.updateOne(
    { user: userId, "items.product": productId },
    { $set: { "items.$.quantity": quantity } }
  );
}

router.patch("/items/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body || {};
    if (!isValidProductId(productId) || !isValidQuantity(quantity)) {
      return res.status(400).json({ message: "A positive whole-number quantity is required" });
    }
    const product = await findActiveProduct(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });
    if (quantity > product.stock) return res.status(400).json({ message: "Requested quantity is not available in stock" });

    const cart = await Cart.findOneAndUpdate(
      { user: req.user._id, "items.product": productId },
      { $set: { "items.$.quantity": quantity } },
      { new: true }
    );
    if (!cart) return res.status(404).json({ message: "Product is not in cart" });
    res.status(200).json({ cart: await getCart(req.user._id) });
  } catch (error) {
    res.status(500).json({ message: "Unable to update cart item" });
  }
});

router.delete("/items/:productId", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.productId)) {
      return res.status(400).json({ message: "Invalid product id" });
    }
    await removeProductFromCart(req.user._id, req.params.productId);
    res.status(200).json({ cart: await getCart(req.user._id) });
  } catch (error) {
    res.status(500).json({ message: "Unable to remove cart item" });
  }
});

router.delete("/", async (req, res) => {
  try {
    await Cart.findOneAndUpdate({ user: req.user._id }, { $set: { items: [] } });
    res.status(200).json({ message: "Cart cleared", cart: await getCart(req.user._id) });
  } catch (error) {
    res.status(500).json({ message: "Unable to clear cart" });
  }
});

module.exports = router;
