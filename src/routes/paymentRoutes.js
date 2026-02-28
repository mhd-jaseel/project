const express = require("express");
const router = express.Router();

const { createOrder, verifyPayment, createRetryOrder, processRetryOrder, verifyRetryPayment } = require("../controllers/paymentController");
const authMiddleware = require("../middleware/authMiddleware");

// ✅ Create Razorpay Order
router.post("/create-order", authMiddleware, createOrder);

// ✅ Verify Payment
router.post("/verify", authMiddleware, verifyPayment);

// ✅ Create Retry Razorpay Order (Deprecated but kept for backwards comp)
router.post("/create-retry-order", authMiddleware, createRetryOrder);

// ✅ Process Retry Order (New multi-method logic)
router.post("/process-retry-order", authMiddleware, processRetryOrder);

// ✅ Verify Retry Payment 
router.post("/verify-retry", authMiddleware, verifyRetryPayment);

module.exports = router;
