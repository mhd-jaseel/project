const mongoose = require("mongoose");
const Product = require("../models/Product");

// Helper: Parse weight string to grams/ml (base unit)

const parseWeight = (str) => {
  if (!str) return 0;

  const s = str.toString().toLowerCase().trim();

  // Implicit 1 unit for standalone words
  if (['piece', 'pc', 'pcs', 'unit', 'each', 'item', 'packet', 'pkt', 'pack', 'packs'].includes(s)) return 1;

  const match = s.match(/(\d+(\.\d+)?)\s*([a-zA-Z]+)?/); //used to extract number and unit from a string
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

const getUnitType = (str) => {
  if (!str) return 'unknown';
  const s = str.toString().toLowerCase().trim();

  // Count/Pieces
  if (['piece', 'pc', 'pcs', 'unit', 'each', 'item', 'packet', 'pkt', 'pack', 'packs'].some(u => s.includes(u))) return 'count';

  const match = s.match(/([a-zA-Z]+)$/); // Match implementation specific to suffix extraction if basic includes fail

  // Clean check based on suffixes usually found in parseWeight
  // Mass
  if (s.endsWith('kg') || s.endsWith('g') || s.endsWith('gms') || s.endsWith('gm') || s.endsWith('mg')) return 'mass';

  // Volume
  if (s.endsWith('l') || s.endsWith('ltr') || s.endsWith('ml')) return 'volume';

  // Fallback for strict strict ending, or just Regex for unit
  const unitMatch = s.match(/[a-z]+$/i);
  if (unitMatch) {
    const u = unitMatch[0];
    if (['kg', 'g', 'gm', 'gms', 'mg'].includes(u)) return 'mass';
    if (['l', 'ltr', 'ml'].includes(u)) return 'volume';
    if (['pc', 'pcs', 'pkt'].includes(u)) return 'count';
  }

  return 'count'; // Default to count if strictly numeric or unknown? Or 'unknown'?
  // existing parseWeight treats standalone numbers as count (implicit 1 unit)
  // So 'count' is a safe default for "100"
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

    // UNIT COMPATIBILITY CHECK
    const weightType = getUnitType(weight);
    const stockType = getUnitType(totalStock);
    if (weightType !== stockType) {
      errors.push(`Incompatible units: Cannot mix ${weightType} (product unit) with ${stockType} (stock unit).`);
    }

    // Return all errors at once if any exist
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join(" ") });
    }

    // Calculate stockQty
    const weightVal = parseWeight(weight);
    const calculatedStockQty = calculateStockQty(stockVal, weightVal);

    // 2. Success 
    const images = [];
    if (req.files['extraImage1'] && req.files['extraImage1'][0]) {
      images.push(`/uploads/products/${req.files['extraImage1'][0].filename}`);
    }
    if (req.files['extraImage2'] && req.files['extraImage2'][0]) {
      images.push(`/uploads/products/${req.files['extraImage2'][0].filename}`);
    }

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
      image: req.files['image'] && req.files['image'][0] ? `/uploads/products/${req.files['image'][0].filename}` : null,
      images: images
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
   WITH SEARCH + LIMIT + PAGINATION
   ============================ */
exports.getAllProducts = async (req, res) => {
  try {

    const page = parseInt(req.query.page) || 1;

    // 🔥 Dynamic limit support
    const isSuggestion = req.query.limit ? true : false;
    const limit = req.query.limit
      ? parseInt(req.query.limit)            // For live search suggestions
      : 20;                                  // Default for product page

    const skip = isSuggestion ? 0 : (page - 1) * limit;

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

    /* ============================
       FILTER STAGE
    ============================ */
    let matchStage = {};

    // 🔍 Search in name + description
    if (search) {
      matchStage.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ];
    }

    // 📂 Category filter
    if (category && mongoose.Types.ObjectId.isValid(category)) {
      matchStage.category = new mongoose.Types.ObjectId(category);
    }

    // 🔥 Hot deal filter
    if (req.query.isHotDeal === "true") {
      matchStage.isHotDeal = true;
    }

    // 📦 Status filter
    if (req.query.status && req.query.status !== "All") {
      matchStage.status = req.query.status;
    }

    /* ============================
       TOTAL COUNT (only for pagination)
    ============================ */
    let totalProducts = 0;
    let totalPages = 1;

    if (!isSuggestion) {
      totalProducts = await Product.countDocuments(matchStage);
      totalPages = Math.ceil(totalProducts / limit);
    }

    /* ============================
       AGGREGATION PIPELINE
    ============================ */
    const products = await Product.aggregate([
      { $match: matchStage },

      // Calculate finalPrice
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

    // Populate category name
    await Product.populate(products, {
      path: "category",
      select: "name"
    });

    /* ============================
       RESPONSE
    ============================ */
    res.json({
      products,
      currentPage: isSuggestion ? 1 : page,
      totalPages: isSuggestion ? 1 : totalPages,
      totalProducts: isSuggestion ? products.length : totalProducts
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

    // Verify product exists first to clearer error handling and access old data
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    let updateData = {
      name,
      company,
      weight,
      price,
      discount: discountValue,
      description,
      category,
      isHotDeal: isHotDeal === 'true'
    };


    // User didn't specify behavior for updates, but usually if you change stock string, you mean it.
    // 4. Update Stock Logic
    let newStockQty;
    let newTotalStock;

    if (totalStock) {
      // Case A: User is updating Total Stock (e.g. restocking)
      // ... (stock update logic remains) ...
      // Validation: Check Unit Compatibility
      const stockType = getUnitType(totalStock);
      const effectiveWeight = weight || product.weight;
      const weightType = getUnitType(effectiveWeight);

      if (stockType !== weightType) {
        return res.status(400).json({
          message: `Incompatible units: Total Stock (${stockType}) cannot be mixed with Product Unit (${weightType}).`
        });
      }

      newTotalStock = parseWeight(totalStock);
      updateData.totalStock = newTotalStock;
      updateData.initialStock = newTotalStock; // Reset initial stock on manual update

      // Recalculate Qty based on NEW total stock and (NEW or OLD) weight
      const weightForCalc = weight ? parseWeight(weight) : parseWeight(product.weight);
      newStockQty = calculateStockQty(newTotalStock, weightForCalc);

    } else if (weight) {
      // Case B: User updated ONLY Weight (e.g. 1kg -> 2kg), but Total Stock (e.g. 10kg) remains same
      // We must recalculate Qty based on EXISTING total stock and NEW weight
      newTotalStock = product.totalStock; // Use existing bulk stock
      const weightForCalc = parseWeight(weight);

      // Validation: If remaining stock is less than the new unit weight, we can't form even 1 unit
      if (newTotalStock < weightForCalc) {
        return res.status(400).json({
          success: false,
          message: "Insufficient stock for this unit size. Please update total stock."
        });
      }

      newStockQty = calculateStockQty(newTotalStock, weightForCalc);
    }

    // Apply changes if calculated
    if (newStockQty !== undefined) {
      updateData.stockQty = newStockQty;
      // Auto-update status
      if (newStockQty === 0) {
        updateData.status = 'Out of Stock';
      } else if (updateData.status === 'Out of Stock' && newStockQty > 0) {
        updateData.status = 'In Stock';
      }
    }

    // Update main image if provided
    if (req.files && req.files['image'] && req.files['image'][0]) {
      updateData.image = `/uploads/products/${req.files['image'][0].filename}`;
    }

    // Update extra images (Specific Slots)
    let currentImages = product.images || [];

    // Ensure array has enough slots if it was empty/short
    if (currentImages.length < 2) {
      while (currentImages.length < 2) currentImages.push(""); // Padding
    }

    if (req.files && req.files['extraImage1'] && req.files['extraImage1'][0]) {
      currentImages[0] = `/uploads/products/${req.files['extraImage1'][0].filename}`;
    }

    if (req.files && req.files['extraImage2'] && req.files['extraImage2'][0]) {
      currentImages[1] = `/uploads/products/${req.files['extraImage2'][0].filename}`;
    }

    // Filter out padding empty strings if strict, but allow replacing specifically
    // We filter at the end
    updateData.images = currentImages.filter(img => img && img !== "");

    const updatedProduct = await Product.findByIdAndUpdate(id, updateData, { new: true });

    if (!updatedProduct) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({
      success: true,
      product: updatedProduct
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

