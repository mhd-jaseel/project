const User = require("../models/User");
const Product = require("../models/Product");

/* ===============================
   GET CART
================================ */
exports.getCart = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate("cart.product");//it replaces it with full Product document
        if (!user) return res.status(404).json({ message: "User not found" });

        let subtotal = 0;

        //code processes the user’s cart by validating products, applying discounts, calculating subtotals, and returning a clean list of cart items along with the total price.
        const items = user.cart.map(item => {
            const product = item.product;
            if (!product) return null; // Handle deleted products

            // Calculate effective price (discounted if available)
            const price = (product.discount && product.discount > 0) ? product.discount : product.price;
            subtotal += price * item.quantity;

            return {
                _id: product._id,
                name: product.name,
                image: product.image,
                price: product.price,
                discount: product.discount,
                quantity: item.quantity,
                stock: product.stock,
                status: product.status,
                subtotal: price * item.quantity
            };
        }).filter(item => item !== null); // Filter out nulls

        const handlingCharge = 2; // Fixed as seen in HTML
        const deliveryCharge = subtotal > 2000 ? 0 : 25;
        const total = subtotal + handlingCharge + deliveryCharge;
        const savings = items.reduce((acc, item) => {
            // Calculate savings if discount exists
            if (item.discount && item.discount > 0) {
                return acc + ((item.price - item.discount) * item.quantity);
            }
            return acc;
        }, 0);

        res.json({
            items,
            bill: {
                subtotal,
                handling: handlingCharge,
                delivery: deliveryCharge,
                total,
                savings
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
};

/* ===============================
   ADD TO CART
================================ */
exports.addToCart = async (req, res) => {
    try {
        const { id, quantity } = req.body;
        const qty = parseInt(quantity) || 1;

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        const product = await Product.findById(id);
        if (!product) return res.status(404).json({ message: "Product not found" });

        // Check if item exists in cart
        const cartItemIndex = user.cart.findIndex(item => item.product.toString() === id);

        if (cartItemIndex > -1) {
            return res.status(400).json({ message: "Product already in cart" });
        } else {
            // Check stock for new item
            if (qty > product.stockQty) {
                return res.status(400).json({ message: `Cannot add. Only ${product.stockQty} available.` });
            }
            // Add new
            user.cart.push({ product: id, quantity: qty });
        }

        await user.save();
        res.json({ message: "Added to cart", cart: user.cart });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
};

/* ===============================
   UPDATE QUANTITY
================================ */
exports.updateCartItem = async (req, res) => {
    try {
        const { id, action } = req.body; // action: 'increase' or 'decrease'

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        const cartItemIndex = user.cart.findIndex(item => item.product.toString() === id);

        if (cartItemIndex === -1) {
            return res.status(404).json({ message: "Item not in cart" });
        }

        if (action === 'increase') {
            const product = await Product.findById(user.cart[cartItemIndex].product);
            if (!product) return res.status(404).json({ message: "Product not found" });

            if (user.cart[cartItemIndex].quantity + 1 > product.stockQty) {
                return res.status(400).json({ message: `Cannot increase. Only ${product.stockQty} available.` });
            }
            user.cart[cartItemIndex].quantity += 1;
        } else if (action === 'decrease') {
            user.cart[cartItemIndex].quantity -= 1;
            if (user.cart[cartItemIndex].quantity < 1) {
                user.cart[cartItemIndex].quantity = 1; // Prevent 0, separate delete required or handle logic here. 
                // Usually removing is explicit.
            }
        }

        await user.save();
        // Return full cart data for UI update
        // We could call getCart internal logic or just return success
        // Returning success triggers frontend reload usually
        res.json({ message: "Cart updated" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
};

/* ===============================
   REMOVE ITEM
================================ */
exports.removeFromCart = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        user.cart = user.cart.filter(item => item.product.toString() !== id);

        await user.save();
        res.json({ message: "Item removed" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
};

/* ===============================
   CLEAR CART
================================ */
exports.clearCart = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        user.cart = [];
        await user.save();
        res.json({ message: "Cart cleared" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
};
