const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const protect = require('../middleware/authMiddleware');
const role = require('../middleware/roleMiddleware');


// ✅ Get My Wallet (Balance + History)
router.get('/my-wallet', protect, walletController.getMyWallet);

// ✅ Get Transaction Details
router.get('/transaction/:transactionId', protect, walletController.getTransactionDetails);

// ✅ Admin: View User Wallet
router.get('/user/:userId', protect, role('admin'), walletController.getUserWallet);


// 🔥 NEW: Create Razorpay Wallet Topup Order
router.post(
    '/create-wallet-topup-order',
    protect,
    walletController.createWalletTopupOrder
);

// 🔥 NEW: Verify Razorpay Wallet Topup
router.post(
    '/verify-wallet-topup',
    protect,
    walletController.verifyWalletTopup
);


module.exports = router;