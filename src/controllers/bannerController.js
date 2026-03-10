const Banner = require('../models/Banner');
const fs = require('fs');
const path = require('path');

// --- Admin Controllers ---

// Add New Banner
// Create and save a new banner with an image
exports.addBanner = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Image is required' });
        }

        const { title, subtitle, isActive, link, buttonText, textColor, buttonColor, bgColor, imageSize } = req.body;

        const newBanner = new Banner({
            title,
            subtitle,
            imageUrl: `/uploads/banners/${req.file.filename}`,
            isActive: isActive === 'true', // Handle string boolean from form-data
            link,
            buttonText,
            textColor,
            buttonColor,
            bgColor,
            imageSize: imageSize ? parseInt(imageSize) : 100
        });

        await newBanner.save();
        res.status(201).json({ message: 'Banner added successfully', banner: newBanner });

    } catch (error) {
        console.error("Error adding banner:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Get All Banners (Admin)
// Retrieve all banners from the database
exports.getAllBanners = async (req, res) => {
    try {
        const banners = await Banner.find().sort({ createdAt: -1 });
        res.json(banners);
    } catch (error) {
        console.error("Error fetching banners:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Toggle Banner Status
// Turn a banner on or off based on its current state
exports.toggleBannerStatus = async (req, res) => {
    try {
        const { bannerId } = req.params;
        const banner = await Banner.findById(bannerId);

        if (!banner) {
            return res.status(404).json({ message: 'Banner not found' });
        }

        banner.isActive = !banner.isActive;
        await banner.save();

        res.json({ message: `Banner ${banner.isActive ? 'enabled' : 'disabled'}`, banner });

    } catch (error) {
        console.error("Error toggling banner:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Delete Banner
// Remove a banner and delete its image file from storage
exports.deleteBanner = async (req, res) => {
    try {
        const { bannerId } = req.params;
        const banner = await Banner.findById(bannerId);

        if (!banner) {
            return res.status(404).json({ message: 'Banner not found' });
        }

        // Try to delete image file
        try {
            const imagePath = path.join(__dirname, '../../src/uploads/banners', path.basename(banner.imageUrl));
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        } catch (err) {
            console.error("Error deleting banner image file:", err);
            // Continue to delete info from DB even if file fail
        }

        await Banner.findByIdAndDelete(bannerId);
        res.json({ message: 'Banner deleted successfully' });

    } catch (error) {
        console.error("Error deleting banner:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Get Single Banner (Admin)
exports.getBannerById = async (req, res) => {
    try {
        const banner = await Banner.findById(req.params.bannerId);
        if (!banner) return res.status(404).json({ message: 'Banner not found' });
        res.json(banner);
    } catch (error) {
        console.error("Error fetching single banner:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Update Banner
exports.updateBanner = async (req, res) => {
    try {
        const { bannerId } = req.params;

        // Prepare update data from body
        const { title, subtitle, isActive, link, buttonText, textColor, buttonColor, bgColor, imageSize } = req.body;

        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (subtitle !== undefined) updateData.subtitle = subtitle;
        if (isActive !== undefined) updateData.isActive = isActive === 'true';
        if (link !== undefined) updateData.link = link;
        if (buttonText !== undefined) updateData.buttonText = buttonText;
        if (textColor !== undefined) updateData.textColor = textColor;
        if (buttonColor !== undefined) updateData.buttonColor = buttonColor;
        if (bgColor !== undefined) updateData.bgColor = bgColor;
        if (imageSize !== undefined) updateData.imageSize = parseInt(imageSize);

        // If new image uploaded
        if (req.file) {
            // Get original banner to delete old image
            const oldBanner = await Banner.findById(bannerId);
            if (oldBanner && oldBanner.imageUrl) {
                try {
                    const oldImagePath = path.join(__dirname, '../../src/uploads/banners', path.basename(oldBanner.imageUrl));
                    if (fs.existsSync(oldImagePath)) {
                        fs.unlinkSync(oldImagePath);
                    }
                } catch (err) {
                    console.error("Error deleting old image during update:", err);
                }
            }
            updateData.imageUrl = `/uploads/banners/${req.file.filename}`;
        }

        const updatedBanner = await Banner.findByIdAndUpdate(
            bannerId,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        if (!updatedBanner) {
            return res.status(404).json({ message: 'Banner not found' });
        }

        res.json({ message: 'Banner updated successfully', banner: updatedBanner });

    } catch (error) {
        console.error("Error updating banner:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// --- Public Controllers ---

// Get Active Banners
// Get only the banners that are currently active for the homepage
exports.getActiveBanners = async (req, res) => {
    try {
        const banners = await Banner.find({ isActive: true }).sort({ createdAt: -1 });
        res.json(banners);
    } catch (error) {
        console.error("Error fetching active banners:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
