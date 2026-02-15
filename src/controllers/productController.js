const mongoose = require("mongoose");
const Product = require("../models/Product");

// Helper: Parse weight string to grams/ml (base unit)

const parseWeight = (str) => {
  if (!str) return 0;

  const s = str.toString().toLowerCase().trim();

  // Implicit 1 unit for standalone words
  if (['piece', 'pc', 'pcs', 'unit', 'each', 'item', 'packet', 'pkt', 'pack', 'packs'].includes(s)) return 1;

  const match = s.match(/(\d+(\.\d+)?)\s*([a-zA-Z]+)?/);
  if (!match) return 0;

  const val = parseFloat(match[1]);
  const unit = match[3] ? match[3].toLowerCase() : '';

  // Mass
  if (unit === 'kg') return val * 1000;
  if (['g', 'gms', 'gm'].includes(unit)) return val;
  if (unit === 'mg') return val / 1000;

  // Volume
  if (['l', 'ltr'].includes(unit)) return val * 1000;
  if (unit === 'ml') return val;

  // Units/Pieces (return raw value)
  return val;
};

const calculateStockQty = (stockVal, weightVal) => {
  if (stockVal <= 0) return 0;
  if (weightVal > 0) return Math.floor(stockVal / weightVal);
  if (stockVal >= 1000) return Math.floor(stockVal / 1000);
  return stockVal;
};

/* ============================
   ADMIN: ADD PRODUCT
============================ */
exports.addProduct = async (req, res) => {
  try {
    const { name, company, weight, price, discount, description, category, isHotDeal, totalStock } = req.body;

    // Validation 
    const errors = [];
    if (!name || name.length < 3) errors.push("Product name must be at least 3 characters.");

    // Price must be a positive number and not zero
    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      errors.push("Price must be a valid number greater than 0.");
    }

    // Discount cannot be more than the price itself
    const numDiscount = parseFloat(discount || 0);
    if (numDiscount < 0 || numDiscount >= numPrice) {
      errors.push("Discount cannot be negative or greater than the actual price.");
    }

    // Category and Stock check
    if (!category) errors.push("Please select a valid category.");
    const stockVal = parseWeight(totalStock); // Assumes your helper function exists
    if (stockVal < 0) errors.push("Stock cannot be negative.");



    // Return all errors at once if any exist
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join(" ") });
    }

    // Calculate stockQty
    const weightVal = parseWeight(weight);
    const calculatedStockQty = calculateStockQty(stockVal, weightVal);

    // 2. Success 
    const product = new Product({
      name,
      company,
      weight,
      price: numPrice,
      discount: numDiscount,
      isHotDeal: isHotDeal === 'true',
      description,
      category,
      totalStock: stockVal,
      initialStock: stockVal,
      stockQty: calculatedStockQty,
      status: calculatedStockQty > 0 ? 'In Stock' : 'Out of Stock',
      image: `/uploads/products/${req.files['image'][0].filename}`,
      images: req.files['extraImages'] ? req.files['extraImages'].map(f => `/uploads/products/${f.filename}`) : []
    });

    await product.save();
    res.status(201).json({ success: true, product });

  } catch (err) {
    console.error("❌ Add product error:", err);
    res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
};

/* ============================
   ADMIN + USER: GET ALL PRODUCTS
   ✅ FIXED: POPULATE CATEGORY NAME
============================ */
exports.getAllProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const sortOption = req.query.sort;
    const search = req.query.search || "";
    const category = req.query.category || "";

    let sortStage = { createdAt: -1 };

    if (sortOption === "lowToHigh") {
      sortStage = { finalPrice: 1 };
    }
    else if (sortOption === "highToLow") {
      sortStage = { finalPrice: -1 };
    }

    // 🔎 Filter Stage
    let matchStage = {};

    if (search) {
      matchStage.name = { $regex: search, $options: "i" };
    }

    if (category) {
      matchStage.category = new mongoose.Types.ObjectId(category);
    }

    if (req.query.isHotDeal === 'true') {
      matchStage.isHotDeal = true;
    }

    if (req.query.status && req.query.status !== 'All') {
      matchStage.status = req.query.status;
    }

    // 🔢 Get Total Count (for pagination)
    const totalProducts = await Product.countDocuments(matchStage);
    const totalPages = Math.ceil(totalProducts / limit);

    // 📦 Aggregation Pipeline
    const products = await Product.aggregate([
      { $match: matchStage },
      {
        $addFields: {
          finalPrice: {
            $cond: {
              if: { $gt: ["$discount", 0] },
              then: "$discount",
              else: "$price"
            }
          }
        }
      },
      { $sort: sortStage },
      { $skip: skip },
      { $limit: limit }
    ]);

    // Populate category
    await Product.populate(products, { path: "category", select: "name" });

    res.json({
      products,
      currentPage: page,
      totalPages,
      totalProducts
    });

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
    const { name, company, weight, price, discount, description, category, isHotDeal, totalStock } = req.body;

    // Parse discount safely
    let discountValue = 0;
    if (discount !== undefined && discount !== null && discount !== "") {
      discountValue = parseFloat(discount);
      if (isNaN(discountValue)) discountValue = 0;
    }

    let updateData = {
      name,
      company,
      weight,
      price,
      discount: discountValue, // ✅ Cleaned discount
      description,
      category,
      isHotDeal: isHotDeal === 'true'
    };

    // If totalStock is being updated, update it and potentially reset initialStock?
    // User didn't specify behavior for updates, but usually if you change stock string, you mean it.
    if (totalStock) {
      const stockVal = parseWeight(totalStock);
      updateData.totalStock = stockVal;
      // If we are restocking, we might want to update initialStock or keep it.
      // Simple logic: if new stock is provided, treat it as current stock. 
      // We might need to update initialStock to this new value if it's a re-stocking action.
      // Let's assume manual update sets both for now to reset the "low stock" counter base.
      updateData.initialStock = stockVal;

      // Also update stockQty
      const weightVal = parseWeight(weight);
      updateData.stockQty = calculateStockQty(stockVal, weightVal);
      // Auto-update status based on new stock level
      if (updateData.stockQty === 0) {
        updateData.status = 'Out of Stock';
      } else {
        updateData.status = 'In Stock';
      }
    }

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

