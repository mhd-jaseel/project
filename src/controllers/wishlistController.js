const User = require("../models/User");

/* ===============================
   GET USER WISHLIST
================================ */
exports.getWishlist = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate("wishlist");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user.wishlist);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

/* ===============================
   ADD TO WISHLIST ✅ FIXED
================================ */
exports.addToWishlist = async (req, res) => {
  try {
    const { productId } = req.params; // ✅ FIX HERE

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const alreadyExists = user.wishlist.some(
      id => id.toString() === productId
    );

    if (alreadyExists) {
      return res.status(400).json({ message: "Already in wishlist" });
    }

    user.wishlist.push(productId);
    await user.save();

    res.json({ message: "Added to wishlist" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ===============================
   REMOVE FROM WISHLIST
================================ */
exports.removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.wishlist = user.wishlist.filter(
      id => id.toString() !== productId
    );

    await user.save();

    res.json({ message: "Removed from wishlist" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

/* ===============================
   CLEAR WISHLIST
================================ */
exports.clearWishlist = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.wishlist = [];
    await user.save();

    res.json({ message: "Wishlist cleared" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};
