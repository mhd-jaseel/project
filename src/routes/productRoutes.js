const express = require("express");
const router = express.Router();

const {
  addProduct,
  getAllProducts,
  deleteProduct,
  getProductsByCategory,
  getProductById
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

// ✅ GET SINGLE PRODUCT
router.get("/:id", getProductById);

// ✅ ADMIN + USER: GET ALL PRODUCTS
router.get("/", getAllProducts);

// ✅ GET PRODUCTS BY CATEGORY
router.get("/category/:categoryId", getProductsByCategory);

// ✅ ADMIN: DELETE PRODUCT
router.delete("/:id", auth, adminOnly("admin"), deleteProduct);

module.exports = router;
