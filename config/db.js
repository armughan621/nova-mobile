const mongoose = require("mongoose");
const Category = require("../models/category");
const createSlug = require("../utils/slug");

const defaultCategories = [
  "Chargers & Adapters",
  "Headphones & Earbuds",
  "Charging Cables",
  "Power Banks",
  "Phone Cases",
].map((name) => ({
  name,
  slug: createSlug(name),
  productCount: 0,
}));

const db = async () => {
  if (!process.env.DB_URL) {
    throw new Error("DB_URL is not configured");
  }

  await mongoose.connect(process.env.DB_URL);
  await Category.bulkWrite(
    defaultCategories.map((category) => ({
      updateOne: {
        filter: { slug: category.slug },
        update: { $setOnInsert: category },
        upsert: true,
      },
    }))
  );
  console.log("Database connected successfully");
};

module.exports = db;
