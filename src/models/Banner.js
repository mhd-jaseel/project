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
        default: ''
    },
    buttonText: {
        type: String,
        default: 'Shop Now'
    },
    textColor: {
        type: String,
        default: '#ffffff'
    },
    buttonColor: {
        type: String,
        default: '#bef67a'
    },
    bgColor: {
        type: String,
        default: '#004d40'
    },
    imageSize: {
        type: Number,
        default: 100 // Percentage
    }
}, { timestamps: true });

module.exports = mongoose.model('Banner', bannerSchema);
