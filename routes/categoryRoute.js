const router = require("express").Router();
const mongoose = require("mongoose");
const Category = require("../models/category");
const {
  authenticate,
  requireAdmin,
  requireAdminForInactive,
} = require("../middleware/auth");
const createSlug = require("../utils/slug");

router.get("/", requireAdminForInactive, async (req, res) => {
  try {
    let categories;

    if (req.query.includeInactive === "true") {
      categories = await Category.find();
    } else {
      categories = await Category.find({ isActive: true });
    }

    res.status(200).json({ categories });
  } catch (error) {
    res.status(500).json({ message: "Unable to fetch categories" });
  }
});

router.use(authenticate, requireAdmin);

router.post("/", async (req, res) => {
  try {
    const { name } = req.body || {};

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Category name is required" });
    }

    const category = await Category.create({
      name: name.trim(),
      slug: createSlug(name),
    });

    res.status(201).json({ category });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Category already exists" });
    }
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({ message: "Category details are invalid" });
    }

    res.status(500).json({ message: "Unable to create category" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    const { name, isActive } = req.body || {};

    const updates = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "Category name must not be empty" });
      }
      updates.name = name.trim();
      updates.slug = createSlug(name);
    }

    if (isActive !== undefined) {
      if (typeof isActive !== "boolean") {
        return res.status(400).json({ message: "isActive must be a boolean" });
      }
      updates.isActive = isActive;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid category fields to update" });
    }

    const category = await Category.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.status(200).json({ category });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Category already exists" });
    }
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({ message: "Category details are invalid" });
    }

    res.status(500).json({ message: "Unable to update category" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    const category = await Category.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true },
    );

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.status(200).json({
      message: "Category archived successfully",
      category,
    });
  } catch (error) {
    res.status(500).json({ message: "Unable to archive category" });
  }
});

module.exports = router;
