const Product = require("../models/Product");

/* ============================
   ADMIN: ADD PRODUCT
============================ */
exports.addProduct = async (req, res) => {
  try {
    const { name, company, weight, price, description, category } = req.body;

    // ✅ Validation
    if (!name || !price || !category) {
      return res.status(400).json({
        message: "Name, price and category are required"
      });
    }

    const product = new Product({
      name,
      company,
      weight,
      price,
      description,
      category,
      image: req.files && req.files['image'] ? `/uploads/products/${req.files['image'][0].filename}` : null,
      images: req.files && req.files['extraImages']
        ? req.files['extraImages'].map(f => `/uploads/products/${f.filename}`)
        : []
    });

    await product.save();

    res.status(201).json({
      success: true,
      product
    });

  } catch (err) {
    console.error("❌ Add product error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ============================
   ADMIN + USER: GET ALL PRODUCTS
   ✅ FIXED: POPULATE CATEGORY NAME
============================ */
exports.getAllProducts = async (req, res) => {
  try {
    const products = await Product.find()
      .populate("category", "name") // ⭐ IMPORTANT FIX
      .sort({ createdAt: -1 });

    res.json(products);
  } catch (err) {
    console.error("❌ Get products error:", err);
    res.status(500).json({ message: "Failed to load products" });
  }
};

/* ============================
   ADMIN: DELETE PRODUCT
============================ */
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    await Product.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Product deleted successfully"
    });

  } catch (err) {
    console.error("❌ Delete product error:", err);
    res.status(500).json({ message: "Delete failed" });
  }
};

/* ============================
   GET PRODUCTS BY CATEGORY
============================ */
exports.getProductsByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    const products = await Product.find({ category: categoryId })
      .populate("category", "name")
      .sort({ createdAt: -1 });

    res.json(products);
  } catch (err) {
    console.error("❌ Category products error:", err);
    res.status(500).json({ message: "Failed to load products" });
  }
};

/* ============================
   GET SINGLE PRODUCT BY ID
============================ */
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate("category", "name");
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  } catch (err) {
    console.error("❌ Get product error:", err);
    res.status(500).json({ message: "Failed to load product" });
  }
};

