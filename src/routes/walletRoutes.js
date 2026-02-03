const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const protect = require('../middleware/authMiddleware');
const role = require('../middleware/roleMiddleware');

// Get My Wallet (Balance + History)
router.get('/my-wallet', protect, walletController.getMyWallet);

// Get Transaction Details
router.get('/transaction/:transactionId', protect, walletController.getTransactionDetails);

// Admin: View User Wallet
router.get('/user/:userId', protect, role('admin'), walletController.getUserWallet);

module.exports = router;
