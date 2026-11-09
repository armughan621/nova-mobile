const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
require("dotenv").config();

router.post("/register", async (req, res) => {
  try {
    const {
      fullName,
      email,
      phoneNumber,
      city,
      address,
      deliveryInstructions,
      password,
    } = req.body || {};

    if (
      typeof fullName !== "string" ||
      typeof email !== "string" ||
      typeof phoneNumber !== "string" ||
      typeof city !== "string" ||
      typeof address !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({ message: "All required registration fields must be provided" });
    }

    if (!fullName.trim() || !city.trim() || !address.trim()) {
      return res.status(400).json({ message: "Name, city, and address must not be empty" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhoneNumber = phoneNumber.trim();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      return res.status(400).json({ message: "A valid email address is required" });
    }
    if (!/^\d{11}$/.test(normalizedPhoneNumber)) {
      return res.status(400).json({ message: "Phone number must contain 11 digits" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const isEmailExist = await User.findOne({ email: normalizedEmail });
    const isPhoneExist = await User.findOne({ phoneNumber: normalizedPhoneNumber });

    if (isEmailExist) {
      return res.status(400).json({ message: "Email already exists!" });
    } else if (isPhoneExist) {
      return res.status(400).json({ message: "Phone number already exists!" });
    }

    const hashedPassword = await bcrypt.hash(password, Number(process.env.hashRounds || 10));
    const newUser = new User({
      fullName,
      email: normalizedEmail,
      phoneNumber: normalizedPhoneNumber,
      city,
      address,
      deliveryInstructions,
      password: hashedPassword,
    });
    await newUser.save();
    res.status(201).json({ message: "User registered successfully!" });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Email or phone number already exists" });
    }
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({ message: "Registration details are invalid" });
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ message: "Email and password are required" });
    }
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user || user.isActive === false) {
      return res.status(400).json({ message: "User not found!" });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(400).json({ message: "Invalid password!" });
    }
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET is not configured" });
    }
    const token = jwt.sign(
      { userId: user._id.toString(), role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.status(200).json({
      message: "Login successful!",
      token,
      user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role },
    });
  } catch (error) {
    res.status(500).json({ message: "Unable to log in" });
  }
});

module.exports = router;
