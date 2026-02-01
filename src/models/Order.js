const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [
        {
            product: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Product',
                required: true
            },
            name: String, // Snapshot of name
            price: Number, // Snapshot of price
            quantity: {
                type: Number,
                required: true
            },
            image: String // Snapshot of image
        }
    ],
    shippingAddress: {
        firstName: String,
        companyName: String,
        streetAddress: String,
        apartment: String,
        city: String,
        phoneNumber: String,
        email: String
    },
    paymentMethod: {
        type: String,
        enum: ['COD', 'Wallet', 'Bank'],
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Completed', 'Failed', 'Refunded'],
        default: 'Pending'
    },
    orderStatus: {
        type: String,
        enum: ['Pending', 'Processing', 'This order is confirmed and being packed', 'Shipped', 'Out For Delivery', 'Delivered', 'Cancelled', 'Returned'],
        default: 'Pending'
    },
    subtotal: {
        type: Number,
        required: true
    },
    deliveryCharge: {
        type: Number,
        required: true
    },
    handlingFee: {
        type: Number,
        required: true
    },
    totalAmount: {
        type: Number,
        required: true
    },
    couponCode: {
        type: String
    },
    discountAmount: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
