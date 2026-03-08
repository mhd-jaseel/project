const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const PDFDocument = require("pdfkit")
const mongoose = require("mongoose");
// Helper function to convert weight strings like "1kg" into base units like 1000
const parseWeight = (str) => {
    if (!str) return 0;

    const s = str.toString().toLowerCase().trim();//Cleaned & standardized version of str

    // Implicit 1 unit for standalone words
    if (['piece', 'pc', 'pcs', 'unit', 'each', 'item', 'packet', 'pkt', 'pack', 'packs'].includes(s)) return 1;

    const match = s.match(/(\d+(\.\d+)?)\s*([a-zA-Z]+)?/);  //used to extract number and unit from a string
    if (!match) return 0;

    const val = parseFloat(match[1]);
    const unit = match[3] ? match[3].toLowerCase() : '';

    // Mass
    if (unit === 'kg') return val * 1000;
    if (['g', 'gms', 'gm'].includes(unit)) return val;
    if (unit === 'mg') return val / 1000;

    // Volume
    if (['l', 'ltr'].includes(unit)) return val * 1000;
    if (unit === 'ml') return val;

    // Units/Pieces (return raw value)
    return val;
};


// Process and save a new order after validating items and stock
exports.placeOrder = async (req, res) => {
    try {
    const { shippingAddress, paymentMethod, saveAddressInfo, couponCode, isFailedPayment } = req.body;
    const userId = req.user.id;

        // 1. Fetch User Cart
        const user = await User.findById(userId).populate('cart.product');
        if (!user || user.cart.length === 0) {
            console.log('Cart empty debug:', userId, user?.cart?.length);
            return res.status(400).json({ message: 'Cart is empty' });
        }

        // 2. Calculate Totals
        let subtotal = 0;
        const orderItems = [];

        for (const item of user.cart) {
            // Check if product exists (optional safeguard)
            if (!item.product) continue;

            // Use the effective price (discount if available)
            const price = (item.product.discount && item.product.discount > 0) ? item.product.discount : item.product.price;
            subtotal += price * item.quantity;

            //  STOCK CHECK
            const unitWeight = parseWeight(item.product.weight);
            if (unitWeight > 0) {
                const requiredStock = unitWeight * item.quantity;
                if (item.product.totalStock < requiredStock) {
                    return res.status(400).json({
                        message: `Insufficient stock for ${item.product.name}. Please select a lower quantity.`
                    });
                }
            } else {
                // Fallback for non-standard units or missing weight
                let available = item.product.stockQty || 0;
                // If stockQty is 0 but totalStock is ostensibly valid (e.g. missing weight config)
                if (available === 0 && item.product.totalStock > 0) {
                    if (item.product.totalStock >= 1000) available = Math.floor(item.product.totalStock / 1000);
                    else available = item.product.totalStock;
                }

                if (available < item.quantity) {
                    return res.status(400).json({
                        message: `Insufficient stock for ${item.product.name}.`
                    });
                }
            }

            orderItems.push({
                product: item.product._id,
                name: item.product.name,
                price: price, // Save the actual price sold at
                quantity: item.quantity,
                image: item.product.image || (item.product.images && item.product.images.length > 0 ? item.product.images[0] : '')
            });
        }

        // 3. Apply Fees & Coupon
        const deliveryCharge = subtotal > 2000 ? 0 : 25;
        const handlingFee = 2;
        let totalAmount = subtotal + deliveryCharge + handlingFee;
        let discountAmount = 0;

        // --- Coupon Logic Start ---
        let couponToUpdate = null;
        if (couponCode) {
            const Coupon = require('../models/Coupon');
            const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });

            if (coupon) {
                const now = new Date();
                // Validate Validity
                const isValidDate = coupon.isActive && now >= coupon.startDate && now <= coupon.expiryDate;
                const isValidAmount = subtotal >= coupon.minOrderAmount;
                const isLimitOk = (!coupon.usageLimit || coupon.usedCount < coupon.usageLimit);
                const isUserLimitOk = coupon.usedUsers.filter(id => id.toString() === userId).length < coupon.perUserLimit;

                if (isValidDate && isValidAmount && isLimitOk && isUserLimitOk) {
                    // Calculator
                    if (coupon.discountType === 'percentage') {
                        discountAmount = (subtotal * coupon.discountValue) / 100;
                        if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
                            discountAmount = coupon.maxDiscountAmount;
                        }
                    } else {
                        discountAmount = coupon.discountValue;
                    }

                    // Security Cap
                    if (discountAmount > subtotal) discountAmount = subtotal;

                    totalAmount -= discountAmount;
                    couponToUpdate = coupon;
                }
            }
        }

        totalAmount = Math.max(0, totalAmount);
        discountAmount = discountAmount;
        // --- Coupon Logic End ---

        // 4. Payment Logic
        let paymentStatus = 'Pending';
        let wallet = null;

        if (paymentMethod === 'Wallet') {
            wallet = await Wallet.findOne({ user: userId });
            if (!wallet || wallet.balance < totalAmount) {
                return res.status(400).json({ message: 'Insufficient wallet balance' });
            }
            wallet.balance -= totalAmount; // Deduct from wallet (memory only)
            paymentStatus = 'Completed';
        } else if (paymentMethod === 'COD') {
            paymentStatus = 'Pending';
        } else if (paymentMethod === 'Razorpay') {
            paymentStatus = isFailedPayment ? 'Failed' : 'Pending';
        }

        // Update coupon usage if used
        if (couponToUpdate) {
            couponToUpdate.usedCount += 1;
            couponToUpdate.usedUsers.push(userId);
            await couponToUpdate.save();
        }

        // 5. Create Order
        const newOrder = new Order({
            user: userId,
            items: orderItems,
            shippingAddress,
            paymentMethod,
            paymentStatus,
            subtotal,
            deliveryCharge,
            handlingFee,
            totalAmount,
            couponCode: couponToUpdate ? couponToUpdate.code : null,
            discountAmount
        });

        const savedOrder = await newOrder.save();

        // Update Stock
        for (const item of orderItems) {
            const product = await Product.findById(item.product);
            if (product) {
                const unitWeight = parseWeight(product.weight);
                if (unitWeight > 0) {
                    const deduction = unitWeight * item.quantity;
                    product.totalStock = Math.max(0, product.totalStock - deduction);

                    // Sync quantity
                    product.stockQty = Math.floor(product.totalStock / unitWeight);

                    // Status Updates
                    if (product.stockQty === 0) {
                        product.status = 'Out of Stock';
                    } else if (product.initialStock > 0 && product.totalStock <= (product.initialStock * 0.2)) {
                        product.status = 'Low Stock';
                    } else {
                        product.status = 'In Stock';
                    }

                    await product.save();
                } else {
                    // Fallback for non-weight products
                    // Handle missing weight logic (repair stock tracking)
                    let deductionUnit = 1;
                    if ((!product.stockQty || product.stockQty === 0) && product.totalStock > 0) {
                        if (product.totalStock >= 1000) deductionUnit = 1000;
                    }

                    const deductionAmount = item.quantity * deductionUnit;

                    if (product.totalStock >= deductionAmount) {
                        product.totalStock = Math.max(0, product.totalStock - deductionAmount);

                        // Re-sync stockQty if we are in this special mode
                        if (product.totalStock >= 1000) product.stockQty = Math.floor(product.totalStock / 1000);
                        else product.stockQty = product.totalStock;
                    } else if (product.stockQty >= item.quantity) {
                        product.stockQty -= item.quantity;
                    }

                    if (product.stockQty === 0 && product.totalStock === 0) {
                        product.status = 'Out of Stock';
                    } else if (product.initialStock > 0 && product.totalStock <= (product.initialStock * 0.2)) {
                        product.status = 'Low Stock';
                    } else {
                        product.status = 'In Stock';
                    }
                    await product.save();
                }
            }
        }

        // Handle Wallet Transaction
        if (paymentMethod === 'Wallet' && wallet) {
            await wallet.save();
            await Transaction.create({
                wallet: wallet._id,
                user: userId,
                amount: totalAmount,
                reason: 'Order Payment',
                orderId: savedOrder._id
            });
        }

        // 6. Clear Cart
        user.cart = [];
        await user.save();


        if (saveAddressInfo) {
            const Address = require('../models/Address');

            // Check if address already exists to avoid duplicates
            // We match strictly on key fields
            const existingAddress = await Address.findOne({
                user: userId,
                houseName: shippingAddress.houseName,
                street: shippingAddress.street,
                pincode: shippingAddress.pincode,
                fullName: shippingAddress.fullName
            });

            if (!existingAddress) {
                // Check if this is the first address
                const addressCount = await Address.countDocuments({ user: userId });
                const isDefault = addressCount === 0;

                const newAddr = new Address({
                    user: userId,
                    ...shippingAddress,
                    isDefault
                });
                await newAddr.save();
            }
        }

        res.status(201).json({ message: 'Order placed successfully', order: savedOrder });

    } catch (error) {
        console.error("Error placing order:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Get My Orders
// Retrieve all orders placed by the currently logged-in user
exports.getMyOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const skip = (page - 1) * limit;

        const totalOrders = await Order.countDocuments({ user: req.user.id });
        const orders = await Order.find({ user: req.user.id })
            .populate('items.product')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            orders,
            currentPage: page,
            totalPages: Math.ceil(totalOrders / limit),
            totalOrders
        });
    } catch (error) {
        console.error("Error fetching my orders:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// --- Admin Controllers ---

// Get All Orders
// Get All Orders
// Get a list of all orders in the system with search and filtering for admin
exports.getAllOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;

        let query = {};
        if (req.query.status && req.query.status !== 'All Status') {
            query.orderStatus = req.query.status;
        }

        if (req.query.search) {
            const search = req.query.search.trim();
            const searchRegex = { $regex: search, $options: 'i' };

            query.$or = [
                { 'shippingAddress.fullName': searchRegex },
                { 'shippingAddress.firstName': searchRegex },
                { 'shippingAddress.lastName': searchRegex },
                { 'shippingAddress.city': searchRegex },
                { 'shippingAddress.mobileNumber': searchRegex },
                { 'shippingAddress.phoneNumber': searchRegex }
            ];

            // Support searching by partial ID (useful for truncated IDs shown in UI)
            query.$or.push({
                $expr: {
                    $regexMatch: {
                        input: { $toString: "$_id" },
                        regex: search,
                        options: "i"
                    }
                }
            });
        }

        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        const orders = await Order.find(query)
            .populate('user', 'name email')
            .populate('items.product')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            orders,
            currentPage: page,
            totalPages,
            totalOrders,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
        });
    } catch (error) {
        console.error("Error fetching all orders:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Update Order Status
// Update the status of an entire order and handle related logic
exports.updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (order.returnStatus === 'Approved' || order.orderStatus === 'Returned') {
            return res.status(400).json({ message: 'Cannot update status of a returned order' });
        }

        if (order.orderStatus === 'Cancelled') {
            return res.status(400).json({ message: 'Cannot update status of a cancelled order' });
        }

        // Check for 24-hour lock if Delivered and no return requested
        if (order.orderStatus === 'Delivered') {
            const deliveredTime = order.deliveredAt ? new Date(order.deliveredAt).getTime() : 0;
            const now = Date.now();
            const hoursSinceDelivery = (now - deliveredTime) / (1000 * 60 * 60);

            // If > 24h passed OR (no deliveredAt set but assuming old), and User hasn't requested return
            // But if deliveredAt is null, we can't strict enforce, so we must set it properly moving forward.
            // Assuming if we are HERE updating status, we are changing FROM delivered.

            if (order.deliveredAt && hoursSinceDelivery > 24 && (!order.returnStatus || order.returnStatus === 'None')) {
                return res.status(400).json({ message: 'Cannot change status: 24-hour return window has expired and no return was requested.' });
            }
        }

        order.orderStatus = status;
        if (status === 'Delivered') {
            // Set deliveredAt if first time delivering
            if (!order.deliveredAt) {
                order.deliveredAt = new Date();
            }
            if (order.paymentMethod === 'COD') {
                order.paymentStatus = 'Completed';
            }
        } else if (status === 'Cancelled') {
            // Refund for Admin Cancellation of Prepaid Orders
            if (order.paymentStatus === 'Completed' && ['Wallet', 'Razorpay'].includes(order.paymentMethod)) {
                let wallet = await Wallet.findOne({ user: order.user });
                if (!wallet) wallet = await Wallet.create({ user: order.user, balance: 0 });

                if (wallet) {
                    wallet.balance += order.totalAmount;
                    await wallet.save();

                    await Transaction.create({
                        wallet: wallet._id,
                        user: order.user,
                        amount: order.totalAmount,
                        reason: 'Admin Cancel Refund',
                        orderId: order._id
                    });
                    order.paymentStatus = 'Refunded';
                }
            }
            order.cancelledAt = new Date();
        }

        // Sync item status if not already Cancelled or Returned
        if (order.items && order.items.length > 0) {
            order.items.forEach(item => {
                const finalStatuses = ['Cancelled', 'Returned', 'Return Requested'];
                if (!finalStatuses.includes(item.itemStatus)) {
                    item.itemStatus = status;
                    if (status === 'Cancelled') item.cancellationReason = 'Cancelled by Admin';
                }
            });
        }

        await order.save();
        res.json({ message: 'Order status updated', order });

    } catch (error) {
        console.error("Error updating order status:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

// Mark Order as Viewed
// Mark an order as having been viewed by the admin
exports.markOrderViewed = async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = await Order.findById(orderId);
        if (order) {
            order.viewedByAdmin = true;
            await order.save();
            res.json({ message: 'Order marked as viewed' });
        } else {
            res.status(404).json({ message: 'Order not found' });
        }
    } catch (error) {
        console.error("Error marking order as viewed:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

// Cancel Order (User)
// Cancel an entire order and process refunds if applicable
exports.cancelOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;
        const userId = req.user.id;

        const order = await Order.findOne({ _id: orderId, user: userId });

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (order.orderStatus !== 'Pending' && order.orderStatus !== 'Confirmed') {
            return res.status(400).json({ message: 'Cannot cancel order at this stage' });
        }

        order.orderStatus = 'Cancelled';
        order.cancellationReason = reason || 'No reason provided';
        order.cancelledAt = new Date();
        order.viewedByAdmin = false; // Notify admin

        // Mark all items as cancelled
        if (order.items && order.items.length > 0) {
            order.items.forEach(item => {
                if (item.itemStatus !== 'Returned') {
                    item.itemStatus = 'Cancelled';
                    item.cancellationReason = order.cancellationReason;
                }
            });
        }

        // Restore Stock
        for (const item of order.items) {
            const product = await Product.findById(item.product);
            if (product) {
                const unitWeight = parseWeight(product.weight);
                if (unitWeight > 0) {
                    product.totalStock += (unitWeight * item.quantity);
                    product.stockQty = Math.floor(product.totalStock / unitWeight);
                    if (product.stockQty > 0 && product.status === 'Out of Stock') {
                        product.status = 'In Stock';
                    }
                    await product.save();
                } else {
                    // Restore fallback
                    let addUnit = 1;
                    if (product.totalStock >= 1000 && product.weight === "") addUnit = 1000;

                    product.totalStock += (item.quantity * addUnit);

                    // Re-sync
                    if (product.totalStock >= 1000 && product.weight === "") product.stockQty = Math.floor(product.totalStock / 1000);
                    else product.stockQty = product.totalStock; // Simple fallback

                    if (product.stockQty > 0) product.status = 'In Stock';
                    await product.save();
                }
            }
        }

        // Wallet Refund (if paid)
        if (order.paymentStatus === 'Completed' && ['Wallet', 'Razorpay'].includes(order.paymentMethod)) {
            let wallet = await Wallet.findOne({ user: userId });
            if (!wallet) wallet = await Wallet.create({ user: userId, balance: 0 });

            if (wallet) {
                wallet.balance += order.totalAmount;
                await wallet.save();

                await Transaction.create({
                    wallet: wallet._id,
                    user: userId,
                    amount: order.totalAmount,
                    reason: 'Cancel Refund',
                    orderId: order._id
                });
                order.paymentStatus = 'Refunded';
            }
        }

        await order.save();

        // Revert Coupon Usage - REMOVED to prevent reuse
        /*
        if (order.couponCode) {
            // Coupon usage is NOT reverted on cancellation as per requirement.
        }
        */

        res.json({ message: 'Order cancelled successfully', order });

    } catch (error) {
        console.error("Error cancelling order:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Get My Cancellations
// Retrieve all orders that have been cancelled by the user
exports.getMyCancellations = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const skip = (page - 1) * limit;

        const filter = {
            user: req.user.id,
            $or: [
                { orderStatus: 'Cancelled' },
                { 'items.itemStatus': 'Cancelled' }
            ]
        };

        const totalCancellations = await Order.countDocuments(filter);
        const cancellations = await Order.find(filter)
            .populate('items.product')
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            cancellations,
            currentPage: page,
            totalPages: Math.ceil(totalCancellations / limit),
            totalCancellations
        });
    } catch (error) {
        console.error("Error fetching my cancellations:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
// Request Return (User)
// Submit a return request for an entire delivered order
exports.requestReturn = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;
        const userId = req.user.id;

        const order = await Order.findOne({ _id: orderId, user: userId });

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (order.orderStatus !== 'Delivered') {
            return res.status(400).json({ message: 'Only delivered orders can be returned' });
        }

        if (order.returnStatus && order.returnStatus !== 'None') {
            return res.status(400).json({ message: 'Return already requested or processed' });
        }

        order.returnStatus = 'Requested';
        order.returnReason = reason || 'No reason provided';
        order.returnRequestedAt = new Date();
        order.viewedByAdmin = false; // Notify admin
        await order.save();

        res.json({ message: 'Return requested successfully', order });

    } catch (error) {
        console.error("Error requesting return:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

/* ======================
    ITEM LIST ACTIONS
====================== */

// Cancel Single Order Item
// Cancel a specific item within an order
exports.cancelOrderItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { reason } = req.body;
        const userId = req.user.id;

        const order = await Order.findOne({ _id: orderId, user: userId });
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const item = order.items.id(itemId);
        if (!item) return res.status(404).json({ message: 'Item not found' });

        if (item.itemStatus === 'Cancelled') {
            return res.status(400).json({ message: 'Item already cancelled' });
        }

        if (['Packed', 'Out For Delivery', 'Delivered'].includes(order.orderStatus)) {
            return res.status(400).json({ message: 'Cannot cancel item at this stage' });
        }

        // 1. Mark Item Cancelled
        item.itemStatus = 'Cancelled';
        item.cancellationReason = reason || 'User requested';

        // Restore Stock
        const product = await Product.findById(item.product);
        if (product) {
            const unitWeight = parseWeight(product.weight);
            if (unitWeight > 0) {
                product.totalStock += (unitWeight * item.quantity);
                product.stockQty = Math.floor(product.totalStock / unitWeight);
                if (product.stockQty > 0 && product.status === 'Out of Stock') product.status = 'In Stock';
                await product.save();
            } else {
                let addUnit = (product.totalStock >= 1000 && product.weight === "") ? 1000 : 1;
                product.totalStock += (item.quantity * addUnit);
                if (product.totalStock >= 1000 && product.weight === "") product.stockQty = Math.floor(product.totalStock / 1000);
                else product.stockQty += item.quantity;
                if (product.stockQty > 0) product.status = 'In Stock';
                await product.save();
            }
        }

        // 2. Recalculate Logic
        const currentTotal = order.totalAmount;
        const itemTotal = item.price * item.quantity;
        const originalSubtotal = order.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const originalDiscount = order.discountAmount || 0;
        const itemShare = originalDiscount > 0 ? (itemTotal / originalSubtotal) * originalDiscount : 0;

        let newSubtotal = 0;
        order.items.forEach(i => {
            if (i.itemStatus !== 'Cancelled' && i.itemStatus !== 'Returned') {
                newSubtotal += i.price * i.quantity;
            }
        });
        order.subtotal = newSubtotal;

        let expectedRefund = 0;
        let isCouponRemoved = false;

        const hadCoupon = !!order.couponCode;

        const activeItemsCount = order.items.filter(i => i.itemStatus !== 'Cancelled' && i.itemStatus !== 'Returned').length;

        if (activeItemsCount === 0) {
            // Full Refund for the last remaining product (Entire order becomes cancelled)
            // This ensures delivery/handling fees are refunded when the last item is gone.
            expectedRefund = order.paymentMethod === 'COD' ? 0 : currentTotal;
            order.totalAmount = 0;
            if (hadCoupon) {
                isCouponRemoved = true;
                order.couponCode = null;
                order.discountAmount = 0;
            }
        } else {
            if (order.couponCode) {
                const CouponModel = require('../models/Coupon');
                const coupon = await CouponModel.findOne({ code: order.couponCode });

                if (coupon && newSubtotal < coupon.minOrderAmount) {
                    isCouponRemoved = true;

                    if (order.paymentMethod === 'COD') {
                        order.couponCode = null;
                        order.discountAmount = 0;
                        order.totalAmount = Math.max(0, newSubtotal + (order.deliveryCharge || 0) + (order.handlingFee || 0));
                        expectedRefund = 0;
                    } else {
                        order.couponCode = null;
                        expectedRefund = Math.round((itemTotal - itemShare) * 100) / 100;
                        order.totalAmount = Math.max(0, currentTotal - expectedRefund);
                    }
                } else {
                    if (order.paymentMethod === 'COD') {
                        expectedRefund = Math.round(itemTotal * 100) / 100;
                        order.totalAmount = Math.max(0, currentTotal - itemTotal);
                    } else {
                        expectedRefund = Math.round((itemTotal - itemShare) * 100) / 100;
                        order.totalAmount = Math.max(0, currentTotal - expectedRefund);
                    }
                }
            } else if (originalDiscount > 0) {
                if (order.paymentMethod !== 'COD') {
                    expectedRefund = Math.round((itemTotal - itemShare) * 100) / 100;
                    order.totalAmount = Math.max(0, currentTotal - expectedRefund);
                } else {
                    expectedRefund = Math.round(itemTotal * 100) / 100;
                    order.totalAmount = Math.max(0, currentTotal - itemTotal);
                }
            } else {
                expectedRefund = Math.round(itemTotal * 100) / 100;
                order.totalAmount = Math.max(0, currentTotal - itemTotal);
            }
        }

        // 3. Wallet Refund
        if (expectedRefund > 0 && order.paymentStatus === 'Completed' && ['Wallet', 'Razorpay'].includes(order.paymentMethod)) {
            let wallet = await Wallet.findOne({ user: userId });
            if (!wallet) wallet = await Wallet.create({ user: userId, balance: 0 });

            if (wallet) {
                wallet.balance += expectedRefund;
                await wallet.save();
                await Transaction.create({
                    wallet: wallet._id, user: userId, amount: expectedRefund,
                    reason: 'Item Cancellation Refund', orderId: order._id
                });
            }
        }

        // Entire Order Check
        const allCancelled = order.items.every(i => i.itemStatus === 'Cancelled');
        if (allCancelled) {
            order.orderStatus = 'Cancelled';
            order.cancelledAt = new Date();
            if (order.paymentMethod !== 'COD' && order.paymentStatus === 'Completed') {
                order.paymentStatus = 'Refunded';
            }
        }

        await order.save();
        res.json({
            message: 'Item cancelled successfully',
            order,
            expectedRefund: expectedRefund,
            couponCancelled: hadCoupon && !order.couponCode
        });

    } catch (error) {
        console.error("Error cancelling item:", error);
        res.status(500).json({ message: "Server Error", error: error.message, stack: error.stack });
    }
};



// Request Return Single Item
// Request a return for a specific item within a delivered order
exports.requestItemReturn = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { reason } = req.body;
        const userId = req.user.id;

        const order = await Order.findOne({ _id: orderId, user: userId });
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const item = order.items.id(itemId);
        if (!item) return res.status(404).json({ message: 'Item not found' });

        if (order.orderStatus !== 'Delivered') {
            return res.status(400).json({ message: 'Order not delivered yet' });
        }

        // 1-hour Return Window Check
        if (order.deliveredAt) {
            const deliveryTime = new Date(order.deliveredAt).getTime();
            const currentTime = new Date().getTime();
            const diffHours = (currentTime - deliveryTime) / (1000 * 60 * 60);
            if (diffHours > 1) {
                return res.status(400).json({ message: 'Return window closed (1 hour after delivery)' });
            }
        }

        if (item.returnStatus !== 'None') {
            return res.status(400).json({ message: 'Return already active for this item' });
        }

        item.returnStatus = 'Requested';
        item.returnReason = reason || 'User requested';
        item.itemStatus = 'Return Requested';

        // Notify Admin
        order.viewedByAdmin = false;

        await order.save();
        res.json({ message: 'Return requested for item', order });

    } catch (error) {
        console.error("Error requesting item return:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Get Order By ID (Admin)
// Retrieve detailed information for a single order by its ID
exports.getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email')
            .populate('items.product');
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }
        res.json(order);
    } catch (error) {
        console.error("Error fetching order:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Update Return Status (Admin)
// Update the status of a return request for an entire order
exports.updateReturnStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body; // Approved, Rejected

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        order.returnStatus = status;

        if (status === 'Approved') {
            order.orderStatus = 'Returned';

            // Restore Stock
            for (const item of order.items) {
                const product = await Product.findById(item.product);
                if (product) {
                    const unitWeight = parseWeight(product.weight);
                    if (unitWeight > 0) {
                        product.totalStock += (unitWeight * item.quantity);
                        product.stockQty = Math.floor(product.totalStock / unitWeight);
                        if (product.stockQty > 0 && product.status === 'Out of Stock') {
                            product.status = 'In Stock';
                        }
                        await product.save();
                    } else {
                        let addUnit = 1;
                        if (product.totalStock >= 1000 && product.weight === "") addUnit = 1000;
                        product.totalStock += (item.quantity * addUnit);

                        if (product.totalStock >= 1000 && product.weight === "") product.stockQty = Math.floor(product.totalStock / 1000);
                        else product.stockQty += item.quantity;

                        if (product.stockQty > 0) product.status = 'In Stock';
                        await product.save();
                    }
                }
            }

            // Wallet Refund
            if (order.paymentStatus === 'Completed') {
                let wallet = await Wallet.findOne({ user: order.user });
                if (!wallet) wallet = await Wallet.create({ user: order.user, balance: 0 });

                if (wallet) {
                    const refundAmount = Math.max(0, Math.round(order.totalAmount - (order.deliveryCharge || 0) - (order.handlingFee || 0)));

                    wallet.balance += refundAmount;
                    await wallet.save();

                    await Transaction.create({
                        wallet: wallet._id,
                        user: order.user,
                        type: 'CREDIT',
                        amount: refundAmount,
                        reason: 'Return Refund',
                        orderId: order._id,
                        description: `Refund for Returned Order #${order._id}`
                    });

                    order.paymentStatus = 'Refunded';
                }
            } else {
                order.paymentStatus = 'Refunded';
            }
        }

        await order.save();
        res.json({ message: 'Return status updated', order });

    } catch (error) {
        console.error("Error updating return status:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
// Update Item Return Status (Admin)
// Update the return status for a single item and process associated refunds
exports.updateItemReturnStatus = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { status } = req.body; // Approved, Rejected

        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const item = order.items.id(itemId);
        if (!item) return res.status(404).json({ message: 'Item not found' });

        item.returnStatus = status;

        if (status === 'Approved') {
            item.itemStatus = 'Returned';

            // Restore Stock for Item
            const product = await Product.findById(item.product);
            if (product) {
                const unitWeight = parseWeight(product.weight);
                if (unitWeight > 0) {
                    product.totalStock += (unitWeight * item.quantity);
                    product.stockQty = Math.floor(product.totalStock / unitWeight);
                    if (product.stockQty > 0 && product.status === 'Out of Stock') {
                        product.status = 'In Stock';
                    }
                    await product.save();
                } else {
                    let addUnit = 1;
                    if (product.totalStock >= 1000 && product.weight === "") addUnit = 1000;
                    product.totalStock += (item.quantity * addUnit);

                    if (product.totalStock >= 1000 && product.weight === "") product.stockQty = Math.floor(product.totalStock / 1000);
                    else product.stockQty += item.quantity;

                    if (product.stockQty > 0) product.status = 'In Stock';
                    await product.save();
                }
            }

            // 1. Recalculate Totals
            const oldTotalAmount = order.totalAmount;
            const originalSubtotal = order.items.reduce((sum, hi) => sum + (hi.price * hi.quantity), 0);
            const itemTotal = item.price * item.quantity;
            const originalDiscount = order.discountAmount || 0;
            let newSubtotal = 0;

            order.items.forEach(i => {
                // Exclude Cancelled AND Returned items from active subtotal
                if (i.itemStatus !== 'Cancelled' && i.itemStatus !== 'Returned') {
                    newSubtotal += i.price * i.quantity;
                }
            });

            order.subtotal = newSubtotal;

            let expectedRefund = 0;
            const itemShare = originalDiscount > 0 ? (itemTotal / originalSubtotal) * originalDiscount : 0;

            // 2. Recalculate Discount
            if (order.items.length === 1) {
                expectedRefund = Math.round((itemTotal - originalDiscount) * 100) / 100;
                order.totalAmount = Math.round(Math.max(0, oldTotalAmount - expectedRefund) * 100) / 100;
                if (order.couponCode) {
                    order.couponCode = null;
                    order.discountAmount = 0;
                }
            } else {
                if (order.couponCode) {
                    const CouponModel = require('../models/Coupon');
                    const couponData = await CouponModel.findOne({ code: order.couponCode });
                    if (couponData && newSubtotal < couponData.minOrderAmount) {
                        if (order.paymentMethod === 'COD') {
                            order.couponCode = null;
                            order.discountAmount = 0;
                            order.totalAmount = Math.round(Math.max(0, (newSubtotal + (order.deliveryCharge || 0) + (order.handlingFee || 0))) * 100) / 100;
                            expectedRefund = 0;
                        } else {
                            order.couponCode = null;
                            expectedRefund = Math.round((itemTotal - itemShare) * 100) / 100;
                            order.totalAmount = Math.round(Math.max(0, oldTotalAmount - expectedRefund) * 100) / 100;
                        }
                    } else {
                        if (order.paymentMethod === 'COD') {
                            expectedRefund = Math.round(itemTotal * 100) / 100;
                            order.totalAmount = Math.round(Math.max(0, oldTotalAmount - itemTotal) * 100) / 100;
                        } else {
                            expectedRefund = Math.round((itemTotal - itemShare) * 100) / 100;
                            order.totalAmount = Math.round(Math.max(0, oldTotalAmount - expectedRefund) * 100) / 100;
                        }
                    }
                } else if (originalDiscount > 0) {
                    if (order.paymentMethod !== 'COD') {
                        expectedRefund = Math.round((itemTotal - itemShare) * 100) / 100;
                        order.totalAmount = Math.round(Math.max(0, oldTotalAmount - expectedRefund) * 100) / 100;
                    } else {
                        expectedRefund = Math.round(itemTotal * 100) / 100;
                        order.totalAmount = Math.round(Math.max(0, oldTotalAmount - itemTotal) * 100) / 100;
                    }
                } else {
                    expectedRefund = Math.round(itemTotal * 100) / 100;
                    order.totalAmount = Math.round(Math.max(0, oldTotalAmount - itemTotal) * 100) / 100;
                }
            }


            // 4. Refund Logic
            if (expectedRefund > 0 && order.paymentStatus === 'Completed') {
                const refundAmount = expectedRefund;

                if (refundAmount > 0) {
                    let wallet = await Wallet.findOne({ user: order.user });
                    if (!wallet) wallet = await Wallet.create({ user: order.user, balance: 0 });

                    if (wallet) {
                        wallet.balance += refundAmount;
                        await wallet.save();

                        await Transaction.create({
                            wallet: wallet._id,
                            user: order.user,
                            amount: refundAmount,
                            reason: 'Item Return Refund',
                            orderId: order._id
                        });

                        // If all items returned, update payment status?
                        // order.paymentStatus = 'RefundedPartial'; // Optional
                    }
                }
            }
        } else if (status === 'Rejected') {
            // Revert item status to Delivered
            item.itemStatus = 'Delivered';
        }

        // Update main order status if ALL items are returned/cancelled
        const allProcessed = order.items.every(i => i.itemStatus === 'Cancelled' || i.itemStatus === 'Returned');
        if (allProcessed) {
            const allReturned = order.items.every(i => i.itemStatus === 'Returned' || i.itemStatus === 'Cancelled'); // Mixed state
            const strictlyReturned = order.items.some(i => i.itemStatus === 'Returned');

            if (strictlyReturned) {
                order.orderStatus = 'Returned';
                if (order.paymentStatus === 'Completed' && order.paymentMethod !== 'COD') {
                    // Check if there was any refund
                    // (Actually we keep paymentStatus as is or mark Refunded)
                }
            } else if (order.items.every(i => i.itemStatus === 'Cancelled')) {
                order.orderStatus = 'Cancelled';
                order.paymentStatus = 'Refunded';
            }
        }

        await order.save();
        res.json({ message: 'Item return status updated', order });

    } catch (error) {
        console.error("Error updating item return status:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Get My Returns
// Get a list of all products that the user has requested to return
exports.getMyReturns = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const skip = (page - 1) * limit;

        const filter = {
            user: req.user.id,
            $or: [
                { returnStatus: { $ne: 'None' } },
                { 'items.returnStatus': { $ne: 'None' } }
            ]
        };

        const totalReturns = await Order.countDocuments(filter);
        const returns = await Order.find(filter)
            .populate('items.product')
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            returns,
            currentPage: page,
            totalPages: Math.ceil(totalReturns / limit),
            totalReturns
        });
    } catch (error) {
        console.error("Error fetching my returns:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
//downloadInvoice

// Generate and download a PDF invoice for a specific order
exports.downloadInvoice = async (req, res) => {
    
    try {
        const orderId = req.params.orderId;

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: "Invalid Order ID" });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        const doc = new PDFDocument({ size: "A4", margin: 50 });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=invoice-${order._id}.pdf`
        );

        doc.pipe(res);

        /* ================= HEADER BACKGROUND ================= */

        doc.rect(0, 0, doc.page.width, 110).fill("#f4f6f8");

        doc
            .fillColor("#2c3e50")
            .fontSize(28)
            .font("Helvetica-Bold")
            .text("KM Store", 50, 45);

        doc
            .fontSize(10)
            .font("Helvetica")
            .fillColor("black")
            .text("Kerala, India", 50, 80);

        /* ================= INVOICE DETAILS (RIGHT SIDE) ================= */

        doc
            .fontSize(10)
            .text(`Invoice No: INV-${order._id.toString().slice(-6)}`, 350, 45)
            .text(`Order ID: ${order._id}`, 350, 60)
            .text(`Date: ${new Date(order.createdAt).toDateString()}`, 350, 75)
            .text(`Payment: ${order.paymentMethod}`, 350, 90);

        /* ================= TABLE HEADER ================= */

        let tableTop = 150;

        doc
            .font("Helvetica-Bold")
            .fontSize(12)
            .text("Product", 50, tableTop)
            .text("Qty", 330, tableTop, { width: 50, align: "center" })
            .text("Price", 390, tableTop, { width: 70, align: "right" })
            .text("Total", 470, tableTop, { width: 70, align: "right" });

        doc
            .moveTo(50, tableTop + 15)
            .lineTo(550, tableTop + 15)
            .stroke();

        /* ================= ITEMS ================= */

        let position = tableTop + 30;
        let grossTotal = 0;
        let cancelledTotal = 0;
        let returnedTotal = 0;

        order.items.forEach((item) => {
            const total = item.quantity * item.price;
            grossTotal += total;
            if (item.itemStatus === 'Cancelled') cancelledTotal += total;
            if (item.itemStatus === 'Returned') returnedTotal += total;

            doc
                .font("Helvetica")
                .fontSize(11)
                .fillColor("black")
                .text(item.name, 50, position)
                .text(item.quantity, 330, position, { width: 50, align: "center" })
                .text(`${item.price}`, 390, position, { width: 70, align: "right" })
                .text(`${total}`, 470, position, { width: 70, align: "right" });

            if (item.itemStatus === 'Cancelled' || item.itemStatus === 'Returned') {
                doc.fillColor('red').fontSize(9).text(`[${item.itemStatus}]`, 50, position + 12).fillColor('black');
            }

            position += 25;
        });

        /* ================= TOTAL SECTION ================= */

        const delivery = order.deliveryCharge || 0;
        const handling = order.handlingFee || 0;

        let actualDiscount = order.discountAmount || 0;
        const mathDiff = grossTotal - cancelledTotal - returnedTotal + delivery + handling - (order.totalAmount || 0);
        if (mathDiff > 0.01) {
            actualDiscount = mathDiff;
        }

        let cancelledRefund = 0;
        let returnedRefund = 0;

        order.items.forEach(itm => {
            const itemTotal = itm.price * itm.quantity;
            if (itm.itemStatus === 'Cancelled') {
                const itemShare = (itemTotal / grossTotal) * actualDiscount;
                cancelledRefund += (itemTotal - itemShare);
            } else if (itm.itemStatus === 'Returned') {
                const itemShare = (itemTotal / grossTotal) * actualDiscount;
                returnedRefund += (itemTotal - itemShare);
            }
        });

        const calculatedTotal = grossTotal - cancelledRefund - returnedRefund + delivery + handling - actualDiscount;

        doc
            .moveTo(300, position + 10)
            .lineTo(550, position + 10)
            .stroke();

        doc
            .font("Helvetica")
            .fontSize(11)
            .text("Subtotal (Gross):", 340, position + 25)
            .text(`${grossTotal.toFixed(2)}`, 470, position + 25, { width: 70, align: "right" });

        let currentPos = position + 45;

        if (actualDiscount > 0) {
            doc.fillColor("green").text("Coupon Discount:", 340, currentPos).text(`-${actualDiscount.toFixed(2)}`, 470, currentPos, { width: 70, align: "right" }).fillColor("black");
            currentPos += 20;
        }

        if (delivery > 0 || handling > 0) {
            doc.text("Shipping & Handling:", 340, currentPos).text(`+${(delivery + handling).toFixed(2)}`, 470, currentPos, { width: 70, align: "right" });
            currentPos += 20;
        }

        if (cancelledRefund > 0) {
            doc.fillColor("red").text(`Cancelled Refund:`, 340, currentPos).text(`-${cancelledRefund.toFixed(2)}`, 470, currentPos, { width: 70, align: "right" }).fillColor("black");
            currentPos += 20;
        }

        if (returnedRefund > 0) {
            doc.fillColor("gray").text(`Returned Refund:`, 340, currentPos).text(`-${returnedRefund.toFixed(2)}`, 470, currentPos, { width: 70, align: "right" }).fillColor("black");
            currentPos += 20;
        }

        doc
            .font("Helvetica-Bold")
            .fontSize(14)
            .text("Final Paid Amount:", 320, currentPos + 10)
            .text(`${calculatedTotal.toFixed(2)}`, 470, currentPos + 10, { width: 70, align: "right" });

        /* ================= FOOTER ================= */

        doc
            .fontSize(9)
            .font("Helvetica")
            .fillColor("gray")
            .text(
                "This is a computer-generated invoice. No signature required.",
                50,
                780,
                { align: "center" }
            );

        doc.end();

    } catch (error) {
        console.error("Invoice Error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

/* ======================
    REFUND CALCULATION
====================== */

// Calculate the refund amount for a specific item based on order totals
exports.calculateItemRefundInfo = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const userId = req.user.id;

        const order = await Order.findOne({ _id: orderId, user: userId });
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const item = order.items.id(itemId);
        if (!item) return res.status(404).json({ message: 'Item not found' });

        const itemTotal = item.price * item.quantity;
        const originalSubtotal = order.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);

        let newSubtotal = 0;
        order.items.forEach(idx => {
            if (idx.itemStatus !== 'Cancelled' && idx.itemStatus !== 'Returned' && idx._id.toString() !== itemId) {
                newSubtotal += idx.price * idx.quantity;
            }
        });

        const currentTotalAmount = order.totalAmount;
        let isCouponRemoved = false;
        let couponAdjustmentMessage = "";
        let expectedRefund = 0;
        let newTotal = 0;

        const action = req.query.action || 'return';
        let hideMessage = false;

        if (order.items.length === 1 && action === 'cancel') {
            expectedRefund = order.paymentMethod === 'COD' ? 0 : currentTotalAmount;
            newTotal = 0;
            isCouponRemoved = !!order.couponCode;
            hideMessage = true;
            couponAdjustmentMessage = "";
        } else if (order.items.length === 1 && action === 'return') {
            const originalDiscount = order.discountAmount || 0;
            expectedRefund = Math.round((itemTotal - originalDiscount) * 100) / 100;
            newTotal = currentTotalAmount - expectedRefund;
            isCouponRemoved = !!order.couponCode;
            couponAdjustmentMessage = `For single-item returns, delivery and handling fees are non-refundable. You will be refunded ₹${expectedRefund} for the product.`;
        } else {
            if (order.couponCode) {
                const Coupon = require('../models/Coupon');
                const coupon = await Coupon.findOne({ code: order.couponCode });
                const originalDiscount = order.discountAmount || 0;
                const itemShare = originalDiscount > 0 ? (itemTotal / originalSubtotal) * originalDiscount : 0;

                if (coupon && newSubtotal < coupon.minOrderAmount) {
                    isCouponRemoved = true;

                    if (order.paymentMethod === 'COD') {
                        newTotal = newSubtotal + (order.deliveryCharge || 0) + (order.handlingFee || 0);
                        expectedRefund = 0;
                        couponAdjustmentMessage = "Cancelling this item invalidates the coupon. The total payable amount will be updated without the coupon discount.";
                    } else {
                        expectedRefund = Math.round((itemTotal - itemShare) * 100) / 100;
                        couponAdjustmentMessage = `The coupon condition fails, so it will be removed. You will be refunded ₹${Math.max(0, expectedRefund)} after deducting the coupon share assigned to this item.`;
                        newTotal = currentTotalAmount - expectedRefund;
                    }
                } else {
                    if (order.paymentMethod === 'COD') {
                        expectedRefund = 0;
                        newTotal = currentTotalAmount - itemTotal;
                    } else {
                        expectedRefund = Math.round((itemTotal - itemShare) * 100) / 100;
                        if (expectedRefund > 0) {
                            couponAdjustmentMessage = `You will be refunded ₹${expectedRefund} after deducting the proportional coupon share assigned to this item.`;
                        } else {
                            couponAdjustmentMessage = `No refund is applicable due to the coupon discount (or negative net: ₹${expectedRefund}).`;
                        }
                        newTotal = currentTotalAmount - expectedRefund;
                    }
                }
            } else if ((order.discountAmount || 0) > 0) {
                const originalDiscount = order.discountAmount || 0;
                const itemShare = (itemTotal / originalSubtotal) * originalDiscount;
                if (order.paymentMethod === 'COD') {
                    expectedRefund = 0;
                    newTotal = currentTotalAmount - itemTotal;
                } else {
                    expectedRefund = Math.round((itemTotal - itemShare) * 100) / 100;
                    if (expectedRefund > 0) {
                        couponAdjustmentMessage = `You will be refunded ₹${expectedRefund} after deducting the proportional coupon share assigned to this item.`;
                    } else {
                        couponAdjustmentMessage = `No refund is applicable due to the coupon discount (or negative net: ₹${expectedRefund}).`;
                    }
                    newTotal = currentTotalAmount - expectedRefund;
                }
            } else {
                expectedRefund = Math.round(itemTotal * 100) / 100;
                newTotal = currentTotalAmount - itemTotal;
            }
        }

        res.json({
            expectedRefund: expectedRefund,
            itemPrice: itemTotal,
            isCouponRemoved,
            newTotal: newTotal,
            currentTotalAmount,
            paymentMethod: order.paymentMethod,
            couponAdjustmentMessage,
            hideMessage
        });

    } catch (error) {
        console.error("Error calculating refund info:", error);
        res.status(500).json({ message: "Server Error", error: error.message, stack: error.stack });
    }
};
