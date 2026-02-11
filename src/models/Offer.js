const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    subtitle: {
        type: String,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    startDate: {
        type: Date
    },
    endDate: {
        type: Date
    },
    themeColor: {
        type: String,
        default: '#2ecc71' // Default green
    },
    image: {
        type: String // Path or URL
    },
    isActive: {
        type: Boolean,
        default: true
    },
    link: {
        type: String,
        default: '#'
    },
    textColor: {
        type: String,
        default: '#ffffff'
    },
    isFullBackground: {
        type: Boolean,
        default: false
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        default: null
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        default: 'percentage'
    },
    discountValue: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

module.exports = mongoose.model('Offer', offerSchema);
