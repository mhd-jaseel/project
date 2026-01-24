const Product = require("../models/Product");

// ADMIN: Add Product
// exports.addProduct = async (req, res) => {
//   try {
//     const product = await Product.create({
//       ...req.body,
//       createdBy: req.user.id
//     });

//     res.status(201).json({
//       success: true,
//       product
//     });
//   } catch (err) {
//     res.status(500).json({ message: "Product creation failed" });
//   }
// };
exports.addProduct = async (req, res) => {
  try {
    const {
      name,
      company,
      price,
      description
    } = req.body;

    const product = new Product({
      name,
      company,
      price,
      description,

      // TEMP DEFAULTS
      category: "General",
      stock: 0,
      status: "In Stock",
      featured: false
    });

    await product.save();

    res.status(201).json({
      message: "Product created",
      product
    });

  } catch (err) {
    console.error("❌ Add product error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ADMIN + USER: Get All Products
exports.getAllProducts = async (req, res) => {
  const products = await Product.find().sort({ createdAt: -1 });
  res.json(products);
};
// ADMIN: Delete Product
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

