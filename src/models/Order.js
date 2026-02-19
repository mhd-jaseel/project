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
            image: String, // Snapshot of image
            itemStatus: {
                type: String,
                enum: ['Pending', 'Confirmed', 'Packed', 'Out For Delivery', 'Delivered', 'Cancelled', 'Return Requested', 'Returned'],
                default: 'Pending'
            },
            cancellationReason: String,
            returnStatus: {
                type: String,
                enum: ['None', 'Requested', 'Approved', 'Rejected'],
                default: 'None'
            },
            returnReason: String
        }
    ],
    shippingAddress: {
        fullName: String,
        mobileNumber: String,
        houseName: String,
        street: String,
        landmark: String,
        city: String,
        state: String,
        pincode: String
    },
    paymentMethod: {
        type: String,
        enum: ['COD', 'Wallet', 'Razorpay'],
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Completed', 'Failed', 'Refunded'],
        default: 'Pending'
    },
    orderStatus: {
        type: String,
        enum: ['Pending', 'Confirmed', 'Packed', 'Out For Delivery', 'Delivered', 'Cancelled', 'Returned'],
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
    },
    viewedByAdmin: {
        type: Boolean,
        default: false
    },
    cancellationReason: {
        type: String
    },
    cancelledAt: {
        type: Date
    },
    deliveredAt: {
        type: Date
    },
    returnStatus: {
        type: String,
        enum: ['None', 'Requested', 'Approved', 'Rejected'],
        default: 'None'
    },
    returnReason: {
        type: String
    },
    returnRequestedAt: {
        type: Date
    }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
