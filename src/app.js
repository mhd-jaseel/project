const express = require("express");
const path = require("path");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const productRoutes = require("./routes/productRoutes")
const categoryRoutes = require("./routes/categoryRoutes");

const app = express();

app.use(express.json());



app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);




// serve static files (css, js, images)
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
