const Category = require("../models/Category");

// ADMIN: Add Category
exports.addCategory = async (req, res) => {
  try {
    const { name } = req.body;

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
  try {
    let categories = await Category.find().sort({ createdAt: -1 });

    // Ensure "Uncategorized" category exists
    let uncategorized = categories.find(c => c.name.toLowerCase() === 'uncategorized');
    if (!uncategorized) {
      uncategorized = await Category.findOne({ name: /Uncategorized/i });
      if (!uncategorized) {
        uncategorized = new Category({
          name: "Uncategorized"
        });
        await uncategorized.save();
      }
      categories.push(uncategorized);
    }

    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch categories" });
  }
};

// ADMIN: Update Category
exports.updateCategory = async (req, res) => {
  try {
    const { name } = req.body;
    let updateData = { name };

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
    const categoryId = req.params.id;

    // First ensure Uncategorized exists
    let uncategorized = await Category.findOne({ name: /Uncategorized/i });
    if (!uncategorized) {
      uncategorized = new Category({
        name: "Uncategorized"
      });
      await uncategorized.save();
    }

    // Prevent deleting the Uncategorized category itself
    if (uncategorized._id.toString() === categoryId) {
      return res.status(400).json({ message: "Cannot delete the default Uncategorized category" });
    }

    // Move all products belonging to this category to Uncategorized
    const Product = require("../models/Product"); // ensure Product model is loaded
    await Product.updateMany(
      { category: categoryId },
      { category: uncategorized._id }
    );

    // Now delete the category
    await Category.findByIdAndDelete(categoryId);
    res.json({ success: true, message: "Category deleted and products moved to Uncategorized." });
  } catch (err) {
    console.error("❌ Delete category error:", err);
    res.status(500).json({ message: "Delete failed" });
  }
};

exports.getAllCategories = async (req, res) => {
  try {
    let categories = await Category.find().sort({ createdAt: -1 });

    // Ensure "Uncategorized" category exists
    let uncategorized = categories.find(c => c.name.toLowerCase() === 'uncategorized');
    if (!uncategorized) {
      uncategorized = await Category.findOne({ name: /Uncategorized/i });
      if (!uncategorized) {
        uncategorized = new Category({
          name: "Uncategorized"
        });
        await uncategorized.save();
      }
      categories.push(uncategorized);
    }

    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch categories" });
  }
};
