const Category = require("../models/Category");

// ADMIN: Add Category
exports.addCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    const category = new Category({
      name,
      description,
      image: req.file
        ? `/uploads/categories/${req.file.filename}`
        : null
    });

    await category.save();

    res.status(201).json({
      success: true,
      category
    });
  } catch (err) {
    console.error("❌ Add category error:", err);
    res.status(500).json({ message: err.message });
  }
};

// PUBLIC: Get all categories
exports.getCategories = async (req, res) => {
  const categories = await Category.find().sort({ createdAt: -1 });
  res.json(categories);
};

// ADMIN: Delete category
exports.deleteCategory = async (req, res) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Delete failed" });
  }
};


exports.getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch categories" });
  }
};
