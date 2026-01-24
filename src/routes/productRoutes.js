const express = require("express");
const router = express.Router();
const {
  addProduct,
  getAllProducts
} = require("../controllers/productController");
const auth = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/roleMiddleware");

// Admin only
router.post("/",  addProduct);

// Admin + User
router.get("/", getAllProducts);

module.exports = router;
