const express = require("express");
const path = require("path");
const session = require("express-session");
const passport = require("passport");

require("./config/passport"); // Passport config


const app = express();

// Robots.txt (This code allows Google to read  full website)
app.get("/robots.txt", (req, res) => {
  res.type("text/plain");
  res.send(`User-agent: *
Allow: /

Sitemap: https://kmsupermarket.online/sitemap.xml`);
});

// Sitemap (Helps search engines understand  website structure)
app.get("/sitemap.xml", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/sitemap.xml"));
});



// Body Parser Middleware (to read incoming data)
app.use(express.json()); // for JSON data (API requests)
app.use(express.urlencoded({ extended: true })); // for form data

// Session Middleware
app.use(
  session({
    secret: "kmstoresecret",
    resave: false,
    saveUninitialized: false,
  })
);

// Passport Middleware
app.use(passport.initialize());

// Serve Uploaded Images
app.use("/uploads", express.static(path.join(__dirname, "uploads")));



// API ROUTES

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
app.use("/api/payment", require("./routes/paymentRoutes"));



// STATIC FRONTEND FILES(show frontend files like HTML, CSS, JS to the browser”)

app.use(express.static(path.join(__dirname, "../public")));
app.use(express.static(path.join(__dirname, "../public/user")));




// HOME PAGE
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/user/homepage.html"));
});

// LOGIN PAGE (SEO friendly)
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/user/login.html"));
});

// Redirect old login URL
app.get("/user/login", (req, res) => {
  res.redirect("/login");
});

// PRODUCTS PAGE
app.get("/products", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/user/product.html"));
});

// CONTACT PAGE
app.get("/contact", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/user/contact.html"));
});



app.get("/admin/login", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/admin/login.html"));
});

app.get("/admin/add-product", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/admin/add-product.html"));
});



module.exports = app;