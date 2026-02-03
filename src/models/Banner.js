const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
    title: {
        type: String,
        trim: true
    },
    subtitle: {
        type: String,
        trim: true
    },
    imageUrl: {
        type: String,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    link: {
        type: String, // Optional: Link to a product or category page
        default: '#'
    }
}, { timestamps: true });

module.exports = mongoose.model('Banner', bannerSchema);
