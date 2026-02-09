const Category = require("../models/Category");

// ADMIN: Add Category
exports.addCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Category name is required" });
    }

    // 1. Normalize the incoming name: Remove all spaces and make lowercase
    const normalizedNewName = name.replace(/\s+/g, '').toLowerCase();

    // 2. Fetch all categories to compare
    const categories = await Category.find();

    // 3. Check if any existing category matches the normalized name
    const isDuplicate = categories.some(cat => {
      const normalizedExisting = cat.name.replace(/\s+/g, '').toLowerCase();
      return normalizedExisting === normalizedNewName;
    });

    if (isDuplicate) {
      return res.status(400).json({ message: "Category already exists (similar spelling/spacing detected)" });
    }

    // 4. If not duplicate, save the category
    const category = new Category({
      name: name.trim(), // Save with original spacing but trimmed ends
      description,
      image: req.file ? `/uploads/categories/${req.file.filename}` : null
    });

    await category.save();

    res.status(201).json({
      success: true,
      category
    });
  } catch (err) {
    console.error("❌ Add category error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
// PUBLIC: Get all categories
exports.getCategories = async (req, res) => {
  const categories = await Category.find().sort({ createdAt: -1 });
  res.json(categories);
};

// ADMIN: Update Category
exports.updateCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    let updateData = { name, description };

    if (req.file) {
      updateData.image = `/uploads/categories/${req.file.filename}`;
    }

    const category = await Category.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json({
      success: true,
      category
    });
  } catch (err) {
    console.error("❌ Update category error:", err);
    res.status(500).json({ message: err.message });
  }
};

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
