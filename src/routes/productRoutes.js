const express = require("express");
const router = express.Router();

const {
  addProduct,
  getAllProducts,
  deleteProduct
} = require("../controllers/productController");

const auth = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/roleMiddleware");

// Admin only
router.post("/", auth, adminOnly("admin"), addProduct);


// Admin + User
router.get("/", getAllProducts);

// Admin only
router.delete("/:id", auth, adminOnly("admin"), deleteProduct);


module.exports = router;
