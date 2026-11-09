const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 80,
  },

  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^\S+@\S+\.\S+$/,
  },

  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    match: /^\d{11}$/,
  },

  city: {
    type: String,
    required: true,
    enum: [
      "Islamabad",
      "Rawalpindi",
      "Lahore",
      "Karachi",
      "Peshawar",
      "Faisalabad",
      "Multan",
      "Quetta",
      "Sialkot",
      "Gujranwala",
      "Bahawalpur",
      "Sargodha",
      "Sukkur",
      "Jhang",
      "Sheikhupura",
      "Rahim Yar Khan",
      "Mardan",
      "Kasur",
      "Okara",
      "Dera Ghazi Khan",
      "Wah Cantt",
    ],
  },

  address: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 100,
  },

  deliveryInstructions: {
    type: String,
    maxlength: 100,
  },

  password: {
    type: String,
    required: true,
    minlength: 6,
  },

  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
  },

  isActive: {
    type: Boolean,
    default: true,
  },
});

const User = mongoose.model("User", userSchema);
module.exports = User;
