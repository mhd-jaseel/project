const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const rateLimit = require("express-rate-limit");
const { register, login, verifyOTP, forgotPassword, resetPassword, getWalletBalance, getProfile, updateProfile } = require("../controllers/authController");
const upload = require("../middleware/upload"); // Import upload middleware

// Rate limit for OTP generation (Register & Forgot Password)
const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: { message: "Too many OTP requests, please try again later." }
});

// Rate limit for Verification attempts
const verifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10, // Limit each IP to 10 verification attempts per windowMs
    message: { message: "Too many verification attempts, please try again later." }
});

router.post("/register", otpLimiter, register);
router.post("/login", login);
router.post("/verify-otp", verifyLimiter, verifyOTP);
router.post("/forgot-password", otpLimiter, forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/wallet", authMiddleware, getWalletBalance);

// Profile Routes
router.get("/me", authMiddleware, getProfile);
router.put("/update-profile", authMiddleware, upload.single("profilePicture"), updateProfile);
router.put("/change-email", authMiddleware, require("../controllers/authController").changeEmail);
router.put("/change-password", authMiddleware, require("../controllers/authController").changePassword);

module.exports = router;
