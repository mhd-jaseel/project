const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');

// Helper: Parse weight string to grams/ml (base unit)
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

// Place Order
exports.placeOrder = async (req, res) => {
    try {
        const { shippingAddress, paymentMethod, saveAddressInfo, couponCode } = req.body;
        const userId = req.user.id; // Fixed: accessing id from decoded token

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
                image: item.product.images && item.product.images.length > 0 ? item.product.images[0] : (item.product.image || '')
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

        totalAmount = Math.max(0, Math.round(totalAmount));
        discountAmount = Math.round(discountAmount);
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
        } else if (paymentMethod === 'Bank') {
            paymentStatus = 'Pending';
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
                type: 'DEBIT',
                amount: totalAmount,
                reason: 'Order Payment',
                orderId: savedOrder._id,
                description: `Payment for Order #${savedOrder._id}`
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
                streetAddress: shippingAddress.streetAddress,
                city: shippingAddress.city,
                firstName: shippingAddress.firstName
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
exports.getMyOrders = async (req, res) => {
    try {
        const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        console.error("Error fetching my orders:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// --- Admin Controllers ---

// Get All Orders
// Get All Orders
exports.getAllOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;

        let query = {};
        if (req.query.status && req.query.status !== 'All Status') {
            query.orderStatus = req.query.status;
        }

        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        const orders = await Order.find(query)
            .populate('user', 'name email')
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
        } else if (order.paymentMethod === 'COD' && status !== 'Reported') {
            // Reset payment if moved back from delivered? (Optional, implies unsafe operation usually)
        }

        // Sync item status if not already Cancelled or Returned
        if (order.items && order.items.length > 0) {
            order.items.forEach(item => {
                const finalStatuses = ['Cancelled', 'Returned', 'Return Requested'];
                if (!finalStatuses.includes(item.itemStatus)) {
                    item.itemStatus = status;
                }
            });
        }

        await order.save();
        res.json({ message: 'Order status updated', order });

    } catch (error) {
        console.error("Error updating order status:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Mark Order as Viewed
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
        res.status(500).json({ message: "Server Error" });
    }
};

// Cancel Order (User)
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

        // Restore Stock
        for (const item of order.items) {
            const product = await Product.findById(item.product);
            if (product) {
                const unitWeight = parseWeight(product.weight);
                if (unitWeight > 0) {
                    product.totalStock += (unitWeight * item.quantity);
                    // Check if status improves
                    if (product.initialStock > 0 && product.totalStock > (product.initialStock * 0.1)) {
                        product.status = 'In Stock';
                    }
                    product.stockQty = Math.floor(product.totalStock / unitWeight);
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
        if (order.paymentStatus === 'Completed' && ['Wallet', 'Bank'].includes(order.paymentMethod)) {
            const wallet = await Wallet.findOne({ user: userId });
            if (wallet) {
                wallet.balance += order.totalAmount;
                await wallet.save();

                await Transaction.create({
                    wallet: wallet._id,
                    user: userId,
                    type: 'CREDIT',
                    amount: order.totalAmount,
                    reason: 'Cancel Refund',
                    orderId: order._id,
                    description: `Refund for Cancelled Order #${order._id}`
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
exports.getMyCancellations = async (req, res) => {
    try {
        const cancellations = await Order.find({
            user: req.user.id,
            orderStatus: 'Cancelled'
        }).sort({ cancelledAt: -1 });
        res.json(cancellations);
    } catch (error) {
        console.error("Error fetching my cancellations:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
// Request Return (User)
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
// Cancel Single Order Item
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

        // Restore Stock for Item
        const product = await Product.findById(item.product);
        if (product) {
            const unitWeight = parseWeight(product.weight);
            if (unitWeight > 0) {
                product.totalStock += (unitWeight * item.quantity);
                if (product.initialStock > 0 && product.totalStock > (product.initialStock * 0.1)) {
                    product.status = 'In Stock';
                }
                product.stockQty = Math.floor(product.totalStock / unitWeight);
                await product.save();
            } else {
                let addUnit = 1;
                // Check if likely using the 1000-unit hack for missing weight
                if (product.totalStock >= 1000 && product.weight === "") addUnit = 1000;

                product.totalStock += (item.quantity * addUnit);

                if (product.totalStock >= 1000 && product.weight === "") product.stockQty = Math.floor(product.totalStock / 1000);

                else product.stockQty += item.quantity;

                if (product.stockQty > 0) product.status = 'In Stock';
                await product.save();
            }
        }

        // 2. Recalculate Totals
        const oldTotalAmount = order.totalAmount;
        let newSubtotal = 0;

        order.items.forEach(i => {
            if (i.itemStatus !== 'Cancelled') {
                newSubtotal += i.price * i.quantity;
            }
        });

        order.subtotal = newSubtotal;

        // Recalculate Discount
        const hadCoupon = !!order.couponCode;

        if (order.couponCode) {
            const Coupon = require('../models/Coupon');
            const coupon = await Coupon.findOne({ code: order.couponCode });

            if (coupon) {
                // Check if coupon is still valid for new subtotal
                if (newSubtotal < coupon.minOrderAmount) {
                    order.couponCode = null;
                    order.discountAmount = 0;

                    // Revert Coupon Usage - REMOVED (Strict one-time use)
                    /*
                    if (coupon.usedCount > 0) coupon.usedCount -= 1;
                    const uIdx = coupon.usedUsers.findIndex(u => u.toString() === userId.toString());
                    if (uIdx > -1) coupon.usedUsers.splice(uIdx, 1);
                    await coupon.save();
                    */

                } else {
                    // Recalculate Discount Value
                    if (coupon.discountType === 'percentage') {
                        let newDiscount = (newSubtotal * coupon.discountValue) / 100;
                        if (coupon.maxDiscountAmount && newDiscount > coupon.maxDiscountAmount) {
                            newDiscount = coupon.maxDiscountAmount;
                        }
                        order.discountAmount = Math.round(newDiscount);
                    } else if (coupon.discountType === 'fixed') {
                        // Keep fixed discount unless subtotal is 0 or less than discount
                        if (newSubtotal === 0) order.discountAmount = 0;
                        else if (order.discountAmount > newSubtotal) order.discountAmount = newSubtotal;
                    }
                }
            } else {
                // Coupon deleted or invalid code
                order.couponCode = null;
                order.discountAmount = 0;
            }
        } else {
            order.discountAmount = 0;
        }

        // New Total
        let newTotal = newSubtotal + order.deliveryCharge + order.handlingFee - order.discountAmount;
        newTotal = Math.max(0, Math.round(newTotal));

        order.totalAmount = newTotal;

        // 3. Refund Logic (Difference)
        if (order.paymentStatus === 'Completed' && ['Wallet', 'Bank'].includes(order.paymentMethod)) {
            const refundAmount = oldTotalAmount - newTotal;

            if (refundAmount > 0) {
                const wallet = await Wallet.findOne({ user: userId });
                if (wallet) {
                    wallet.balance += refundAmount;
                    await wallet.save();

                    await Transaction.create({
                        wallet: wallet._id,
                        user: userId,
                        type: 'CREDIT',
                        amount: refundAmount,
                        reason: 'Item Cancellation Refund',
                        orderId: order._id,
                        description: `Refund for cancelled item: ${item.name}`
                    });
                }
            }
        }

        // Check if all items are cancelled
        const allCancelled = order.items.every(i => i.itemStatus === 'Cancelled');
        if (allCancelled) {
            order.orderStatus = 'Cancelled';
            order.cancellationReason = 'All items cancelled by user';
            order.cancelledAt = new Date();
        }

        await order.save();

        // Return couponCancelled in response
        res.json({
            message: 'Item cancelled successfully',
            order,
            couponCancelled: hadCoupon && !order.couponCode
        });

    } catch (error) {
        console.error("Error cancelling item:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Request Return Single Item
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
exports.getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate('user', 'name email');
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
                        if (product.initialStock > 0 && product.totalStock > (product.initialStock * 0.1)) {
                            product.status = 'In Stock';
                        }
                        product.stockQty = Math.floor(product.totalStock / unitWeight);
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
                const wallet = await Wallet.findOne({ user: order.user });
                if (wallet) {
                    wallet.balance += order.totalAmount;
                    await wallet.save();

                    await Transaction.create({
                        wallet: wallet._id,
                        user: order.user,
                        type: 'CREDIT',
                        amount: order.totalAmount,
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
                    if (product.initialStock > 0 && product.totalStock > (product.initialStock * 0.1)) {
                        product.status = 'In Stock';
                    }
                    product.stockQty = Math.floor(product.totalStock / unitWeight);
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

            // 1. Recalculate Totals (Similar to Cancel logic)
            const oldTotalAmount = order.totalAmount;
            let newSubtotal = 0;

            order.items.forEach(i => {
                // Exclude Cancelled AND Returned items from active subtotal
                if (i.itemStatus !== 'Cancelled' && i.itemStatus !== 'Returned') {
                    newSubtotal += i.price * i.quantity;
                }
            });

            order.subtotal = newSubtotal;

            // 2. Recalculate Discount
            if (order.couponCode) {
                const Coupon = require('../models/Coupon');
                const coupon = await Coupon.findOne({ code: order.couponCode });

                if (coupon && coupon.discountType === 'percentage') {
                    let newDiscount = (newSubtotal * coupon.discountValue) / 100;
                    if (coupon.maxDiscountAmount && newDiscount > coupon.maxDiscountAmount) {
                        newDiscount = coupon.maxDiscountAmount;
                    }
                    order.discountAmount = Math.round(newDiscount);
                } else if (coupon && coupon.discountType === 'fixed') {
                    if (newSubtotal === 0) order.discountAmount = 0;
                    else if (order.discountAmount > newSubtotal) order.discountAmount = newSubtotal;
                }
            } else {
                // If no coupon, maintain existing logic (usually 0)
            }

            // 3. New Total
            let newTotal = newSubtotal + order.deliveryCharge + order.handlingFee - order.discountAmount;
            newTotal = Math.max(0, Math.round(newTotal));
            order.totalAmount = newTotal;

            // 4. Refund Logic (Difference)
            if (order.paymentStatus === 'Completed') {
                const refundAmount = oldTotalAmount - newTotal;

                if (refundAmount > 0) {
                    const wallet = await Wallet.findOne({ user: order.user });
                    if (wallet) {
                        wallet.balance += refundAmount;
                        await wallet.save();

                        await Transaction.create({
                            wallet: wallet._id,
                            user: order.user,
                            type: 'CREDIT',
                            amount: refundAmount,
                            reason: 'Item Return Refund',
                            orderId: order._id,
                            description: `Refund for Returned Item: ${item.name}`
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

        // Do NOT change main order status unless ALL items are returned/cancelled
        // (User Request: "The order status on the order page should change only when the entire order is cancelled.")
        // But if all items are Returned, maybe we should mark order as Returned?
        // User said: "If a single product is cancelled, the order status should not change."
        // Let's implicitely follow this for Returns too.

        await order.save();
        res.json({ message: 'Item return status updated', order });

    } catch (error) {
        console.error("Error updating item return status:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Get My Returns
exports.getMyReturns = async (req, res) => {
    try {
        const returns = await Order.find({
            user: req.user.id,
            returnStatus: { $ne: 'None' }
        }).sort({ returnRequestedAt: -1 });
        res.json(returns);
    } catch (error) {
        console.error("Error fetching my returns:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
