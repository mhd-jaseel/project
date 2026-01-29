const Product = require("../models/Product");

/* ============================
   ADMIN: ADD PRODUCT
============================ */
exports.addProduct = async (req, res) => {
  try {
    const { name, company, weight, price, discount, description, category, isHotDeal } = req.body;

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
      discount, // ✅ Added discount field
      isHotDeal: isHotDeal === 'true',
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
   ADMIN: UPDATE PRODUCT
============================ */
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, company, weight, price, discount, description, category, status, featured, isHotDeal } = req.body;

    let updateData = {
      name,
      company,
      weight,
      price,
      discount, // ✅ Added discount field
      description,
      category,
      status, // e.g. "In Stock", "Out of Stock"
      featured: featured === 'true', // Convert string to boolean
      isHotDeal: isHotDeal === 'true'
    };

    // Update main image if provided
    if (req.files && req.files['image']) {
      updateData.image = `/uploads/products/${req.files['image'][0].filename}`;
    }

    // Update extra images if provided
    if (req.files && req.files['extraImages']) {
      updateData.images = req.files['extraImages'].map(f => `/uploads/products/${f.filename}`);
    }

    const product = await Product.findByIdAndUpdate(id, updateData, { new: true });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({
      success: true,
      product
    });

  } catch (err) {
    console.error("❌ Update product error:", err);
    res.status(500).json({ message: err.message });
  }
};
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

/* ============================
   ADMIN: TOGGLE HOT DEAL
============================ */
exports.toggleHotDeal = async (req, res) => {
  try {
    const { id } = req.params;
    const { isHotDeal } = req.body;

    const product = await Product.findByIdAndUpdate(
      id,
      { isHotDeal },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({
      success: true,
      product
    });

  } catch (err) {
    console.error("❌ Toggle Hot Deal error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ============================
   ADMIN: UPDATE STOCK STATUS
============================ */
exports.updateStockStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ["In Stock", "Out of Stock", "Low Stock"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const product = await Product.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({
      success: true,
      product
    });

  } catch (err) {
    console.error("❌ Update Stock Status error:", err);
    res.status(500).json({ message: err.message });
  }
};

