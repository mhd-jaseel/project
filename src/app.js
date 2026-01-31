const express = require("express");
const path = require("path");

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const productRoutes = require("./routes/productRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");

const app = express();

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Serve uploaded images
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/cart", require("./routes/cartRoutes"));
app.use("/api/contact", require("./routes/contactRoutes"));

// Serve static frontend files
app.use(express.static(path.join(__dirname, "../public")));

// USER HTML ROUTES
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/user/homepage.html"));
});

app.get("/user/login", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/user/login.html"));
});

// ADMIN HTML ROUTES
app.get("/admin/login", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/admin/login.html"));
});

app.get("/admin/add-product", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/admin/add-product.html"));
});

module.exports = app;
