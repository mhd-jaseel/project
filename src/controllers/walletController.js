const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');

// Get My Wallet (Balance + History)
exports.getMyWallet = async (req, res) => {
    try {
        const userId = req.user.id;
        let wallet = await Wallet.findOne({ user: userId });

        if (!wallet) {
            // Self-healing: Create wallet if missing
            wallet = await Wallet.create({ user: userId });
        }

        const transactions = await Transaction.find({ wallet: wallet._id })
            .sort({ createdAt: -1 });

        res.json({
            balance: wallet.balance,
            transactions
        });
    } catch (error) {
        console.error("Error fetching wallet:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Get Single Transaction Details
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
