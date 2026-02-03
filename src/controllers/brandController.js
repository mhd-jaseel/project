const Brand = require('../models/Brand');
const fs = require('fs');
const path = require('path');

// Add Brand
exports.addBrand = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Image is required' });
        }

        const newBrand = new Brand({
            imageUrl: `/uploads/brands/${req.file.filename}`
        });

        await newBrand.save();
        res.status(201).json({ message: 'Brand added successfully', brand: newBrand });

    } catch (error) {
        console.error("Error adding brand:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Get All Brands
exports.getAllBrands = async (req, res) => {
    try {
        const brands = await Brand.find().sort({ createdAt: -1 });
        res.json(brands);
    } catch (error) {
        console.error("Error fetching brands:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Delete Brand (Admin)
exports.deleteBrand = async (req, res) => {
    try {
        const { brandId } = req.params;
        const brand = await Brand.findById(brandId);

        if (!brand) {
            return res.status(404).json({ message: 'Brand not found' });
        }

        // Try to delete image file
        try {
            // Adjust path based on your folder structure if needed
            const imagePath = path.join(__dirname, '../../', brand.imageUrl);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        } catch (err) {
            console.error("Error deleting brand image file:", err);
        }

        await Brand.findByIdAndDelete(brandId);
        res.json({ message: 'Brand deleted successfully' });

    } catch (error) {
        console.error("Error deleting brand:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
