const express = require("express");
const router = express.Router();

const {
  addProduct,
  getAllProducts,
  deleteProduct,
  getProductsByCategory
} = require("../controllers/productController");

const auth = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/roleMiddleware");
const upload = require("../middleware/upload");

// ✅ ADMIN: ADD PRODUCT (ONLY ONE POST ROUTE)
router.post(
  "/",
  auth,
  adminOnly("admin"),
  upload.single("image"), // ✅ Multer MUST be here
  addProduct
);

// ✅ ADMIN + USER: GET ALL PRODUCTS
router.get("/", getAllProducts);

// ✅ GET PRODUCTS BY CATEGORY
router.get("/category/:categoryId", getProductsByCategory);

// ✅ ADMIN: DELETE PRODUCT
router.delete("/:id", auth, adminOnly("admin"), deleteProduct);

module.exports = router;
