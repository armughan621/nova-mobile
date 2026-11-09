const router = require("express").Router();
const mongoose = require("mongoose");
const Product = require("../models/product");
const Category = require("../models/category");
const {
  authenticate,
  requireAdmin,
  requireAdminForInactive,
} = require("../middleware/auth");
const createSlug = require("../utils/slug");

const productFields =
  "name slug description brand sku category price compareAtPrice stock images rating isActive";

function parseNumberQuery(value) {
  if (value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function refreshCategoryCount(categoryId) {
  if (!categoryId) return;
  const productCount = await Product.countDocuments({ category: categoryId, isActive: true });
  await Category.findByIdAndUpdate(categoryId, { productCount });
}

router.get("/", requireAdminForInactive, async (req, res) => {
  try {
    if (
      (req.query.category !== undefined && typeof req.query.category !== "string") ||
      (req.query.search !== undefined && typeof req.query.search !== "string") ||
      (req.query.brand !== undefined && typeof req.query.brand !== "string")
    ) {
      return res.status(400).json({ message: "category, search, and brand must be strings" });
    }

    const filter = {
      isActive:
        req.query.includeInactive === "true" ? { $in: [true, false] } : true,
    };

    if (req.query.category) {
      if (mongoose.isValidObjectId(req.query.category)) {
        filter.category = req.query.category;
      } else {
        const category = await Category.findOne({
          slug: req.query.category.toLowerCase(),
          isActive: true,
        }).select("_id");

        if (!category) {
          return res.status(200).json({ products: [] });
        }
        filter.category = category._id;
      }
    }

    if (req.query.search) filter.$text = { $search: req.query.search };
    if (req.query.brand) {
      filter.brand = new RegExp(`^${escapeRegExp(req.query.brand)}$`, "i");
    }

    const minimumPrice = parseNumberQuery(req.query.minPrice);
    const maximumPrice = parseNumberQuery(req.query.maxPrice);
    const minimumRating = parseNumberQuery(req.query.minRating);

    if (req.query.minPrice !== undefined && minimumPrice === null) {
      return res.status(400).json({ message: "minPrice must be a valid number" });
    }
    if (req.query.maxPrice !== undefined && maximumPrice === null) {
      return res.status(400).json({ message: "maxPrice must be a valid number" });
    }
    if (req.query.minRating !== undefined && minimumRating === null) {
      return res.status(400).json({ message: "minRating must be a valid number" });
    }
    if (minimumPrice !== null && minimumPrice < 0) {
      return res.status(400).json({ message: "minPrice cannot be negative" });
    }
    if (maximumPrice !== null && maximumPrice < 0) {
      return res.status(400).json({ message: "maxPrice cannot be negative" });
    }
    if (minimumRating !== null && (minimumRating < 0 || minimumRating > 5)) {
      return res.status(400).json({ message: "minRating must be between 0 and 5" });
    }
    if (minimumPrice !== null || maximumPrice !== null) {
      filter.price = {};
      if (minimumPrice !== null) filter.price.$gte = minimumPrice;
      if (maximumPrice !== null) filter.price.$lte = maximumPrice;
    }
    if (minimumRating !== null) filter.rating = { $gte: minimumRating };

    if (req.query.inStock === "true") {
      filter.stock = { $gt: 0 };
    } else if (req.query.inStock !== undefined && req.query.inStock !== "false") {
      return res.status(400).json({ message: "inStock must be true or false" });
    }

    const products = await Product.find(filter)
      .populate("category", "name slug")
      .sort({ createdAt: -1 })
      .select(productFields);

    res.status(200).json({ products });
  } catch (error) {
    res.status(500).json({ message: "Unable to fetch products" });
  }
});

router.get("/:id", requireAdminForInactive, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid product id" });
    }
    const product = await Product.findOne({
      _id: req.params.id,
      isActive: req.query.includeInactive === "true" ? { $in: [true, false] } : true,
    }).populate("category", "name slug").select(productFields);

    if (!product) return res.status(404).json({ message: "Product not found" });
    res.status(200).json({ product });
  } catch (error) {
    res.status(500).json({ message: "Unable to fetch product" });
  }
});

router.use(authenticate, requireAdmin);

router.post("/", async (req, res) => {
  try {
    const { name, category, price, description, brand, sku } = req.body || {};
    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof description !== "string" ||
      !description.trim() ||
      typeof brand !== "string" ||
      !brand.trim() ||
      typeof sku !== "string" ||
      !sku.trim() ||
      price === undefined
    ) {
      return res.status(400).json({
        message: "name, category, price, description, brand and sku are required",
      });
    }
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({ message: "price must be a non-negative number" });
    }
    if (!mongoose.isValidObjectId(category)) {
      return res.status(400).json({ message: "Invalid category id" });
    }
    if (!(await Category.exists({ _id: category, isActive: true }))) {
      return res.status(400).json({ message: "Active category not found" });
    }

    const product = await Product.create({
      name: name.trim(),
      slug: createSlug(name),
      description: description.trim(),
      brand: brand.trim(),
      sku: sku.trim().toUpperCase(),
      category,
      price,
      ...(req.body.compareAtPrice !== undefined && { compareAtPrice: req.body.compareAtPrice }),
      ...(req.body.stock !== undefined && { stock: req.body.stock }),
      ...(req.body.images !== undefined && { images: req.body.images }),
      ...(req.body.rating !== undefined && { rating: req.body.rating }),
      ...(req.body.isActive !== undefined && { isActive: req.body.isActive }),
    });
    await refreshCategoryCount(category);
    res.status(201).json({ product });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "Product name or SKU already exists" });
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({ message: "Product details are invalid" });
    }
    res.status(500).json({ message: "Unable to create product" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid product id" });
    }
    const current = await Product.findById(req.params.id);
    if (!current) return res.status(404).json({ message: "Product not found" });

    const allowedFields = [
      "name",
      "description",
      "brand",
      "sku",
      "category",
      "price",
      "compareAtPrice",
      "stock",
      "images",
      "rating",
      "isActive",
    ];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body?.[field] !== undefined) updates[field] = req.body[field];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid product fields to update" });
    }
    if (updates.name !== undefined) {
      if (typeof updates.name !== "string" || !updates.name.trim()) {
        return res.status(400).json({ message: "Product name must not be empty" });
      }
      updates.name = updates.name.trim();
      updates.slug = createSlug(updates.name);
    }
    if (updates.sku !== undefined) {
      if (typeof updates.sku !== "string" || !updates.sku.trim()) {
        return res.status(400).json({ message: "SKU must not be empty" });
      }
      updates.sku = updates.sku.trim().toUpperCase();
    }
    if (updates.category) {
      if (!mongoose.isValidObjectId(updates.category)) {
        return res.status(400).json({ message: "Invalid category id" });
      }
      if (!(await Category.exists({ _id: updates.category, isActive: true }))) {
        return res.status(400).json({ message: "Active category not found" });
      }
    }

    const product = await Product.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).populate("category", "name slug");
    if (!product) return res.status(404).json({ message: "Product not found" });
    await refreshCategoryCount(current.category);
    if (updates.category && updates.category.toString() !== current.category.toString()) {
      await refreshCategoryCount(updates.category);
    }
    res.status(200).json({ product });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "Product name or SKU already exists" });
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({ message: "Product details are invalid" });
    }
    res.status(500).json({ message: "Unable to update product" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid product id" });
    }
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    ).populate("category", "name slug");
    if (!product) return res.status(404).json({ message: "Product not found" });
    await refreshCategoryCount(product.category._id || product.category);
    res.status(200).json({ message: "Product archived successfully", product });
  } catch (error) {
    res.status(500).json({ message: "Unable to archive product" });
  }
});

module.exports = router;
