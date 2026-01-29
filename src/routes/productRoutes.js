const express = require("express");
const router = express.Router();

const {
  addProduct,
  getAllProducts,
  deleteProduct,
  getProductsByCategory,
  getProductById,
  updateProduct,
  toggleHotDeal,
  updateStockStatus
} = require("../controllers/productController");

const auth = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/roleMiddleware");
const upload = require("../middleware/upload");

// ✅ ADMIN: ADD PRODUCT (ONLY ONE POST ROUTE)
router.post(
  "/",
  auth,
  adminOnly("admin"),
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'extraImages', maxCount: 4 }]),
  addProduct
);

// ✅ ADMIN: UPDATE PRODUCT
router.put(
  "/:id",
  auth,
  adminOnly("admin"),
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'extraImages', maxCount: 4 }]),
  updateProduct
);

// ✅ ADMIN: TOGGLE HOT DEAL
router.patch(
  "/:id/hot-deal",
  auth,
  adminOnly("admin"),
  toggleHotDeal
);

// ✅ ADMIN: UPDATE STOCK STATUS
router.patch(
  "/:id/stock-status",
  auth,
  adminOnly("admin"),
  updateStockStatus
);

// ✅ GET SINGLE PRODUCT
router.get("/:id", getProductById);

// ✅ ADMIN + USER: GET ALL PRODUCTS
router.get("/", getAllProducts);

// ✅ GET PRODUCTS BY CATEGORY
router.get("/category/:categoryId", getProductsByCategory);

// ✅ ADMIN: DELETE PRODUCT
router.delete("/:id", auth, adminOnly("admin"), deleteProduct);

module.exports = router;
