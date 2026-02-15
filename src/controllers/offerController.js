const Offer = require('../models/Offer');

// Create Offer (Admin)
exports.createOffer = async (req, res) => {
    try {
        const { title, subtitle, description, startDate, endDate, themeColor, link, textColor, isFullBackground, category, discountType, discountValue } = req.body;

        let imagePath = '';
        if (req.file) {
            imagePath = `/uploads/products/${req.file.filename}`; // Assuming serve static path matches
        }

        const newOffer = new Offer({
            title,
            subtitle,
            description,
            startDate,
            endDate,
            themeColor,
            image: imagePath,
            link,
            textColor,
            isFullBackground: isFullBackground === 'true',
            category: category || null,
            discountType: 'percentage',
            discountValue: discountValue || 0,
            isActive: true
        });

        await newOffer.save();
        res.status(201).json({ success: true, message: 'Offer created successfully', offer: newOffer });
    } catch (error) {
        console.error("Error creating offer:", error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get All Offers (Admin)
exports.getAllOffers = async (req, res) => {
    try {
        const offers = await Offer.find().sort({ createdAt: -1 });
        res.json(offers);
    } catch (error) {
        console.error("Error fetching all offers:", error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get Active Offers (User/Homepage)
exports.getActiveOffers = async (req, res) => {
    try {
        const now = new Date();
        const offers = await Offer.find({
            isActive: true,
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).sort({ createdAt: -1 });
        res.json(offers);
    } catch (error) {
        console.error("Error fetching active offers:", error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get Upcoming Offers (User/Homepage)
exports.getUpcomingOffers = async (req, res) => {
    try {
        const now = new Date();
        const offers = await Offer.find({
            isActive: true,
            startDate: { $gt: now }
        }).sort({ startDate: 1 });
        res.json(offers);
    } catch (error) {
        console.error("Error fetching upcoming offers:", error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Delete Offer (Admin)
exports.deleteOffer = async (req, res) => {
    try {
        const { id } = req.params;
        await Offer.findByIdAndDelete(id);
        res.json({ success: true, message: 'Offer deleted' });
    } catch (error) {
        console.error("Error deleting offer:", error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get Offer By ID (Admin/Edit)
exports.getOfferById = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id);
        if (!offer) return res.status(404).json({ message: 'Offer not found' });
        res.json(offer);
    } catch (error) {
        console.error("Error fetching offer:", error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Update Offer (Admin)
exports.updateOffer = async (req, res) => {
    try {
        const { title, subtitle, description, startDate, endDate, link, isActive, themeColor, textColor, isFullBackground, category, discountType, discountValue } = req.body;
        const offer = await Offer.findById(req.params.id);

        if (!offer) return res.status(404).json({ message: 'Offer not found' });

        offer.title = title || offer.title;
        offer.subtitle = subtitle || offer.subtitle;
        offer.description = description || offer.description;
        offer.startDate = startDate || offer.startDate;
        offer.endDate = endDate || offer.endDate;
        offer.link = link || offer.link;
        offer.themeColor = themeColor || offer.themeColor;
        offer.textColor = textColor || offer.textColor;

        if (category !== undefined) {
            offer.category = category || null;
        }
        offer.discountType = 'percentage';
        offer.discountValue = discountValue !== undefined ? discountValue : offer.discountValue;

        if (isFullBackground !== undefined) {
            offer.isFullBackground = isFullBackground === 'true';
        }

        if (isActive !== undefined) {
            offer.isActive = isActive === 'true'; // Handle string/boolean
        }

        if (req.file) {
            offer.image = `/uploads/products/${req.file.filename}`;
        }

        await offer.save();
        res.json({ success: true, message: 'Offer updated successfully', offer });

    } catch (error) {
        console.error("Error updating offer:", error);
        res.status(500).json({ message: 'Server error' });
    }
};
