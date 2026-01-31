const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");

const {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  clearWishlist
} = require("../controllers/wishlistController");

/* GET wishlist */
router.get("/", auth, getWishlist);

/* ADD to wishlist */
router.post("/:productId", auth, addToWishlist);

/* REMOVE single item */
router.delete("/:productId", auth, removeFromWishlist);

/* CLEAR wishlist */
router.delete("/", auth, clearWishlist);

module.exports = router;
