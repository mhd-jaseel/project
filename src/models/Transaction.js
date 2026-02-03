const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    wallet: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Wallet',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['CREDIT', 'DEBIT'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    reason: {
        type: String, // 'Order Payment', 'Cancel Refund', 'Return Refund', 'Adjustment'
        required: true
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order'
    },
    description: {
        type: String
    }
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
