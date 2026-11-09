const router = require("express").Router();
const User = require("../models/user");
const Order = require("../models/order");
const Product = require("../models/product");
const { authenticate, requireAdmin } = require("../middleware/auth");

const userFields =
  "_id fullName email phoneNumber city address deliveryInstructions role isActive createdAt updatedAt";

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

function getStartOfToday() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

router.use(authenticate, requireAdmin);

router.get("/users", async (req, res) => {
  try {
    const filter =
      req.query.includeInactive === "true" ? {} : { isActive: { $ne: false } };
    const users = await User.find(filter)
      .select(userFields)
      .sort({ createdAt: -1 });

    res.status(200).json({ users });
  } catch (error) {
    res.status(500).json({ message: "Unable to fetch users" });
  }
});

router.get("/users/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const user = await User.findById(req.params.id).select(userFields);
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ message: "Unable to fetch user" });
  }
});

router.patch("/users/:id", async (req, res) => {
  try {
    const body = req.body || {};
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    const isCurrentUser = req.params.id.toLowerCase() === req.user._id.toString();
    if (
      isCurrentUser &&
      (body.role === "user" || body.isActive === false)
    ) {
      return res.status(400).json({ message: "You cannot remove or deactivate your own admin account" });
    }

    const allowedFields = [
      "fullName",
      "email",
      "phoneNumber",
      "city",
      "address",
      "deliveryInstructions",
      "role",
      "isActive",
    ];
    const updates = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid user fields to update" });
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).select(userFields);
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({ message: "User updated successfully", user });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Email or phone number already exists" });
    }
    res.status(500).json({ message: "Unable to update user" });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    if (req.params.id.toLowerCase() === req.user._id.toString()) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    ).select(userFields);
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({ message: "User archived successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Unable to archive user" });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const startOfToday = getStartOfToday();

    const [
      totalUsers,
      totalProducts,
      totalOrders,
      todayOrders,
      ordersByStatus,
    ] = await Promise.all([
      User.countDocuments({ role: "user" }),
      Product.countDocuments({ isActive: true }),
      Order.countDocuments(),
      Order.countDocuments({ createdAt: { $gte: startOfToday } }),
      Order.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const statusCounts = Object.fromEntries(
      ordersByStatus.map((status) => [status._id, status.count])
    );

    const orderCounts = Object.fromEntries(
      ORDER_STATUSES.map((status) => [status, statusCounts[status] || 0])
    );

    res.status(200).json({
      stats: {
        totalUsers,
        totalProducts,
        totalOrders,
        todayOrders,
        ...orderCounts,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Unable to fetch dashboard stats" });
  }
});

function isValidId(id) {
  return /^[a-f\d]{24}$/i.test(id);
}

module.exports = router;
