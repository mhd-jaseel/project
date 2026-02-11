const express = require("express");
const path = require("path");




const app = express();

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// API Routes (Clean & Consistent)

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/categories", require("./routes/categoryRoutes"));
app.use("/api/wishlist", require("./routes/wishlistRoutes"));
app.use("/api/cart", require("./routes/cartRoutes"));
app.use("/api/contact", require("./routes/contactRoutes"));
app.use("/api/address", require("./routes/addressRoutes"));
app.use("/api/orders", require("./routes/orderRoutes"));
app.use("/api/coupons", require("./routes/couponRoutes"));
app.use("/api/wallet", require("./routes/walletRoutes"));
app.use("/api/banners", require("./routes/bannerRoutes"));
app.use("/api/brands", require("./routes/brandRoutes"));
app.use("/api/offers", require("./routes/offerRoutes"));


// Serve static frontend files
app.use(express.static(path.join(__dirname, "../public")));
app.use(express.static(path.join(__dirname, "../public/user")));

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
