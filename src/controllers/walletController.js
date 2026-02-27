const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');

const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});


//add money
// Create a Razorpay order to initiate a wallet balance top-up
exports.createWalletTopupOrder = async (req, res) => {
    try {
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ message: "Invalid amount" });
        }

        const options = {
            amount: amount * 100,
            currency: "INR",
            receipt: "wallet_" + Date.now()
        };

        const order = await razorpay.orders.create(options);

        res.json({ order });

    } catch (error) {
        console.error("Wallet topup order error:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

//verify add money



// Verify the payment signature and credit the amount to the user's wallet
exports.verifyWalletTopup = async (req, res) => {
    try {
        const userId = req.user.id;

        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        // 1. Verify Signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;

        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: "Payment verification failed"
            });
        }

        //  2. Prevent Duplicate Credit
        const existingTransaction = await Transaction.findOne({
            paymentId: razorpay_payment_id
        });

        if (existingTransaction) {
            return res.status(400).json({
                success: false,
                message: "Payment already processed"
            });
        }

        //  3. Fetch Actual Paid Amount from Razorpay (Secure)
        const payment = await razorpay.payments.fetch(razorpay_payment_id);
        const paidAmount = payment.amount / 100; // convert paise to ₹

        //  4. Find or Create Wallet
        let wallet = await Wallet.findOne({ user: userId });

        if (!wallet) {
            wallet = await Wallet.create({
                user: userId,
                balance: 0
            });
        }

        //  5. Update Wallet Balance
        wallet.balance += paidAmount;
        await wallet.save();

        //  6. Create Transaction History Entry
        await Transaction.create({
            user: userId,
            wallet: wallet._id,
            amount: paidAmount,
            reason: "Wallet Topup",
            paymentId: razorpay_payment_id,

        });

        res.json({
            success: true,
            message: "Wallet credited successfully"
        });

    } catch (error) {
        console.error("Wallet Topup Verification Error:", error);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};

// Get My Wallet (Balance + History)
// Retrieve the current user's wallet balance and transaction history
exports.getMyWallet = async (req, res) => {
    try {
        const userId = req.user.id;
        let wallet = await Wallet.findOne({ user: userId });

        if (!wallet) {
            wallet = await Wallet.create({ user: userId });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const totalTransactions = await Transaction.countDocuments({ wallet: wallet._id });
        const transactions = await Transaction.find({ wallet: wallet._id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            wallet: { balance: wallet.balance },
            transactions,
            currentPage: page,
            totalPages: Math.ceil(totalTransactions / limit),
            totalTransactions
        });
    } catch (error) {
        console.error("Error fetching wallet:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Get Single Transaction Details
// Get detailed information and reason for a specific wallet transaction
exports.getTransactionDetails = async (req, res) => {
    try {
        const userId = req.user.id;
        const { transactionId } = req.params;

        const transaction = await Transaction.findOne({ _id: transactionId, user: userId })
            .populate('orderId', 'cancellationReason returnReason orderStatus');

        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found or access denied' });
        }

        res.json(transaction);
    } catch (error) {
        console.error("Error fetching transaction details:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Admin: Get User Wallet
// Retrieve the wallet balance and history for a specific user (Admin)
exports.getUserWallet = async (req, res) => {
    try {
        const { userId } = req.params;
        const wallet = await Wallet.findOne({ user: userId });

        if (!wallet) {
            return res.status(404).json({ message: 'Wallet not found for this user' });
        }

        const transactions = await Transaction.find({ wallet: wallet._id })
            .sort({ createdAt: -1 });

        res.json({
            balance: wallet.balance,
            transactions
        });
    } catch (error) {
        console.error("Error fetching user wallet:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
