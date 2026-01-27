const express = require("express");
const router = express.Router();

const {
  addProduct,
  getAllProducts,
  deleteProduct,
  getProductsByCategory   // 👈 ADD THIS
} = require("../controllers/productController");

const auth = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/roleMiddleware");

// Admin only
router.post("/", auth, adminOnly("admin"), addProduct);

// Admin + User
router.get("/", getAllProducts);

// ✅ NEW ROUTE (Category → Products)
router.get("/category/:categoryId", getProductsByCategory);

// Admin only
router.delete("/:id", auth, adminOnly("admin"), deleteProduct);

module.exports = router;
