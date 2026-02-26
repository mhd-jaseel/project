const Coupon = require('../models/Coupon');
const Order = require('../models/Order');

// 1. Create Coupon (Admin)
// Create a new discount coupon with custom rules and limits
exports.createCoupon = async (req, res) => {
    try {
        const {
            code, discountType, discountValue, minOrderAmount,
            maxDiscountAmount, startDate, expiryDate, usageLimit, perUserLimit, isActive
        } = req.body;

        // Check uniqueness
        const existing = await Coupon.findOne({ code: code.toUpperCase() });
        if (existing) {
            return res.status(400).json({ message: 'Coupon code already exists' });
        }

        const coupon = await Coupon.create({
            code,
            discountType,
            discountValue,
            minOrderAmount,
            maxDiscountAmount,
            startDate,
            expiryDate,
            usageLimit,
            perUserLimit,
            isActive
        });

        res.status(201).json({ message: 'Coupon created successfully', coupon });

    } catch (error) {
        console.error("Create coupon error:", error);
        res.status(500).json({ message: error.message });
    }
};

// 2. Get All Coupons (Admin)
// Retrieve all coupons from the system for admin management
exports.getAllCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        res.json(coupons);
    } catch (error) {
        console.error("Get coupons error:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// 3. Update Coupon (Admin)
// Update the details and rules of an existing coupon
exports.updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Prevent editing 'code' to something that exists if needed, or lock code editing.
        // For simplicity, allow all.

        const coupon = await Coupon.findByIdAndUpdate(id, updates, { new: true });
        if (!coupon) return res.status(404).json({ message: 'Coupon not found' });

        res.json({ message: 'Coupon updated', coupon });

    } catch (error) {
        console.error("Update coupon error:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// 4. Delete Coupon (Admin - Optional)
// Permanently remove a coupon from the database
exports.deleteCoupon = async (req, res) => {
    try {
        await Coupon.findByIdAndDelete(req.params.id);
        res.json({ message: 'Coupon deleted' });
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
};

// 5. Apply Coupon (User - Checkout)
// Validate and apply a coupon code to calculate discounts for an order
exports.applyCoupon = async (req, res) => {
    try {
        const { code, orderAmount } = req.body;
        const userId = req.user.id; // From auth middleware

        if (!code || !orderAmount) {
            return res.status(400).json({ message: 'Code and order amount required' });
        }

        const coupon = await Coupon.findOne({ code: code.toUpperCase() });

        // -- Validation Rules --

        // 1. Exists
        if (!coupon) return res.status(404).json({ message: 'Invalid coupon code' });

        // 2. Is Active
        if (!coupon.isActive) return res.status(400).json({ message: 'Coupon is inactive' });

        // 3. Date Validity
        const now = new Date();
        if (now < new Date(coupon.startDate)) return res.status(400).json({ message: 'Coupon not started yet' });
        if (now > new Date(coupon.expiryDate)) return res.status(400).json({ message: 'Coupon expired' });

        // 4. Min Order Amount
        if (orderAmount < coupon.minOrderAmount) {
            return res.status(400).json({ message: `Minimum order amount ₹${coupon.minOrderAmount} required` });
        }

        // 5. Usage Limit (Global)
        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
            return res.status(400).json({ message: 'Coupon usage limit exceeded' });
        }

        // 6. Per User Limit
        const userUsage = coupon.usedUsers.filter(uid => uid.toString() === userId).length;
        if (userUsage >= coupon.perUserLimit) {
            return res.status(400).json({ message: 'You have already used this coupon' });
        }

        // -- Calculate Discount --
        let discount = 0;
        if (coupon.discountType === 'percentage') {
            discount = (orderAmount * coupon.discountValue) / 100;
            if (coupon.maxDiscountAmount && discount > coupon.maxDiscountAmount) {
                discount = coupon.maxDiscountAmount;
            }
        } else if (coupon.discountType === 'fixed') {
            discount = coupon.discountValue;
        }

        // Ensure discount doesn't exceed order amount
        if (discount > orderAmount) {
            discount = orderAmount;
        }

        res.json({
            success: true,
            code: coupon.code,
            discountAmount: Math.round(discount),
            newTotal: Math.round(orderAmount - discount),
            message: 'Coupon applied successfully'
        });

    } catch (error) {
        console.error("Apply coupon error:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
// 6. Get Available Coupons for User
// Get a list of coupons that are currently valid for the user to use
exports.getAvailableCoupons = async (req, res) => {
    try {
        const userId = req.user.id;
        const now = new Date();

        // 1. Fetch potentially valid coupons (Active + Not Expired)
        // We include future startDate for "upcoming"
        const coupons = await Coupon.find({
            isActive: true,
            expiryDate: { $gt: now }
        }).sort({ createdAt: -1 });

        const available = coupons.map(coupon => {
            const isUpcoming = new Date(coupon.startDate) > now;

            // Global Usage Limit Check
            if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
                return null;
            }

            // Per User Limit Check
            const userUsage = coupon.usedUsers.filter(uid => uid.toString() === userId).length;
            if (userUsage >= coupon.perUserLimit) {
                return null;
            }

            return {
                code: coupon.code,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
                minOrderAmount: coupon.minOrderAmount,
                maxDiscountAmount: coupon.maxDiscountAmount,
                expiryDate: coupon.expiryDate,
                startDate: coupon.startDate,
                status: isUpcoming ? 'upcoming' : 'active',
                description: `${coupon.discountType === 'percentage' ? coupon.discountValue + '%' : '₹' + coupon.discountValue} OFF`
            };
        }).filter(c => c !== null);

        res.json(available);

    } catch (error) {
        console.error("Get available coupons error:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
