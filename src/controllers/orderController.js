const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');

// Place Order
exports.placeOrder = async (req, res) => {
    try {
        const { shippingAddress, paymentMethod, saveAddressInfo } = req.body;
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

        // 3. Apply Fees
        const deliveryCharge = subtotal > 2000 ? 0 : 25;
        const handlingFee = 2; // Fixed fee matching cartController
        const totalAmount = subtotal + deliveryCharge + handlingFee;

        // 4. Payment Logic
        let paymentStatus = 'Pending';
        if (paymentMethod === 'Wallet') {
            if (user.wallet < totalAmount) {
                return res.status(400).json({ message: 'Insufficient wallet balance' });
            }
            user.wallet -= totalAmount; // Deduct from wallet
            paymentStatus = 'Completed';
        } else if (paymentMethod === 'COD') {
            paymentStatus = 'Pending';
        } else if (paymentMethod === 'Bank') {
            // For simplicity, we assume Bank transfer is external or verified later
            // Could be 'Pending' until admin verifies
            paymentStatus = 'Pending';
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
            totalAmount
        });

        const savedOrder = await newOrder.save();

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
            const newAddr = new Address({
                user: userId,
                ...shippingAddress
            });
            await newAddr.save();
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
        const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
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
