const User = require("../models/User");
const jwt = require("jsonwebtoken");

// ADMIN LOGIN
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Find user
    const admin = await User.findOne({ email });
    if (!admin) {
      return res.status(401).json({ message: "Admin not found" });
    }

    // 2. Check role
    if (admin.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    // 3. Check password (plain OR bcrypt – adjust if using bcrypt)
    if (admin.password !== password) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // 4. Generate token (IMPORTANT)
    const token = jwt.sign(
      {
        id: admin._id,
        role: admin.role, // 👈 MUST be admin
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      user: {
        id: admin._id,
        email: admin.email,
        role: admin.role,
      },
    });

  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
