const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/roleMiddleware");
const upload = require("../middleware/upload");

const {addProduct, getAllProducts,deleteProduct,getProductsByCategory,getProductById,updateProduct,toggleHotDeal,updateStockStatus
} = require("../controllers/productController");




// ======================
// 🔹 PUBLIC ROUTES
// ======================

// GET ALL PRODUCTS (WITH SORT SUPPORT)
router.get("/", getAllProducts);

//  GET PRODUCTS BY CATEGORY
router.get("/category/:categoryId", getProductsByCategory);

//  GET SINGLE PRODUCT
router.get("/:id", getProductById);


// ======================
// 🔹 ADMIN ROUTES
// ======================

//  ADD PRODUCT
router.post(
  "/",
  auth,
  adminOnly("admin"),
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "extraImage1", maxCount: 1 },
    { name: "extraImage2", maxCount: 1 }
  ]),
  addProduct
);

// ✅ UPDATE PRODUCT
router.put(
  "/:id",
  auth,
  adminOnly("admin"),
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "extraImage1", maxCount: 1 },
    { name: "extraImage2", maxCount: 1 }
  ]),
  updateProduct
);

// ✅ TOGGLE HOT DEAL
router.patch(
  "/:id/hot-deal",
  auth,
  adminOnly("admin"),
  toggleHotDeal
);

// ✅ UPDATE STOCK STATUS
router.patch(
  "/:id/stock-status",
  auth,
  adminOnly("admin"),
  updateStockStatus
);

// ✅ DELETE PRODUCT
router.delete(
  "/:id",
  auth,
  adminOnly("admin"),
  deleteProduct
);

module.exports = router;
