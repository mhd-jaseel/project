const express = require("express");
const router = express.Router();

const {
  addCategory,
  getCategories,
  getAllCategories,
  deleteCategory,
  updateCategory
} = require("../controllers/categoryController");

const upload = require("../middleware/categoryUpload");
const auth = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/roleMiddleware");

// Admin
router.post(
  "/",
  auth,
  adminOnly("admin"),
  upload.single("image"),
  addCategory
);

// Admin: Update
router.put(
  "/:id",
  auth,
  adminOnly("admin"),
  upload.single("image"),
  updateCategory
);

// Public
router.get("/", getCategories);

// Admin
router.delete("/:id", auth, adminOnly("admin"), deleteCategory);
router.get("/", getAllCategories);


module.exports = router;
