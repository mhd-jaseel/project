const express = require("express");
const router = express.Router();
const passport = require("passport");
const rateLimit = require("express-rate-limit");

const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

const {
  register,
  login,
  verifyOTP,
  forgotPassword,
  resetPassword,
  getWalletBalance,
  getProfile,
  updateProfile,
  changeEmail,
  changePassword,
  googleLoginSuccess
} = require("../controllers/authController");


// ==============================
// RATE LIMITERS
// ==============================

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Too many OTP requests, please try again later." }
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Too many verification attempts, please try again later." }
});


// ==============================
// NORMAL AUTH ROUTES
// ==============================

router.post("/register", otpLimiter, register);
router.post("/login", login);
router.post("/verify-otp", verifyLimiter, verifyOTP);
router.post("/forgot-password", otpLimiter, forgotPassword);
router.post("/reset-password", resetPassword);

router.get("/wallet", authMiddleware, getWalletBalance);

// Profile Routes
router.get("/me", authMiddleware, getProfile);
router.put("/update-profile", authMiddleware, updateProfile);
router.put("/change-email", authMiddleware, changeEmail);
router.put("/change-password", authMiddleware, changePassword);


// ==============================
// GOOGLE AUTH ROUTES (JWT BASED)
// ==============================

// Step 1: Redirect to Google
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account"
  })
);

// Step 2: Google Callback
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  googleLoginSuccess //  Controller will generate JWT
);

module.exports = router;
