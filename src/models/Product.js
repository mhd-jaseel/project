const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    company: String,
    weight: String, // e.g. "500g", "1L", "10 pcs"
    price: Number,
    discount: Number,
    stockQty: Number,
    status: {
      type: String,
      enum: ["In Stock", "Low Stock", "Out of Stock"],
      default: "In Stock"
    },
    description: String,
    image: String,
    images: [String],

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true
    },

    isHotDeal: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },

    // Weight-based Stock Management
    totalStock: { type: Number, default: 0 }, // In grams or ml
    initialStock: { type: Number, default: 0 }, // For calculating 90% usage

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
