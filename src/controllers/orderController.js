const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');

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

        // 7. Save Address if requested (Optional logic, usually handled by separate API call or here)
        // Since we have a checkbox "Save this information for faster check-out next time"
        // we can trigger address save. Ideally, we separate concerns, but doing it here ensures atomicity if needed.
        // However, we will assume the frontend calls the address save API if needed or we do it here.
        // Let's rely on the frontend calling the address API if checked, or we can add it here implicitly.
        // Given complexity, let's keep it simple: Controller focuses on Order. Frontend calls Save Address if checked.
        // BUT, for "Fast Checkout" next time, we need to save it. 
        // Let's support implicit save if 'saveAddressInfo' is true and we can use the Address model.
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
exports.getAllOrders = async (req, res) => {
    try {
        const orders = await Order.find().populate('user', 'name email').sort({ createdAt: -1 });
        res.json(orders);
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

        order.orderStatus = status;
        if (status === 'Delivered' && order.paymentMethod === 'COD') {
            order.paymentStatus = 'Completed';
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

        // Revert Coupon Usage
        if (order.couponCode) {
            const Coupon = require('../models/Coupon');
            const coupon = await Coupon.findOne({ code: order.couponCode });
            if (coupon) {
                if (coupon.usedCount > 0) {
                    coupon.usedCount -= 1;
                }
                // Remove user from usedUsers (remove only one instance)
                const userIndex = coupon.usedUsers.findIndex(u => u.toString() === userId);
                if (userIndex > -1) {
                    coupon.usedUsers.splice(userIndex, 1);
                }
                await coupon.save();
            }
        }

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
