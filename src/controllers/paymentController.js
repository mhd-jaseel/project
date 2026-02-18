const razorpay = require("../config/razorpay");
const crypto = require("crypto");
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Address = require("../models/Address");
const Coupon = require("../models/Coupon");

// Helper from orderController (to ensure consistent stock logic)
const parseWeight = (str) => {
  if (!str) return 0;
  const s = str.toString().toLowerCase().trim();
  if (['piece', 'pc', 'pcs', 'unit', 'each', 'item', 'packet', 'pkt', 'pack', 'packs'].includes(s)) return 1;
  const match = s.match(/(\d+(\.\d+)?)\s*([a-zA-Z]+)?/);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[3] ? match[3].toLowerCase() : '';
  if (unit === 'kg') return val * 1000;
  if (['g', 'gms', 'gm'].includes(unit)) return val;
  if (unit === 'mg') return val / 1000;
  if (['l', 'ltr'].includes(unit)) return val * 1000;
  if (unit === 'ml') return val;
  return val;
};

// 1. Create Razorpay Order (Securely)
exports.createOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).populate("cart.product");

    if (!user || user.cart.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    let subtotal = 0;
    for (const item of user.cart) {
      if (!item.product) continue;
      // Matches orderController logic
      const price = (item.product.discount && item.product.discount > 0) ? item.product.discount : item.product.price;
      subtotal += price * item.quantity;
    }

    const deliveryCharge = subtotal > 2000 ? 0 : 25;
    const handlingFee = 2;
    let totalAmount = subtotal + deliveryCharge + handlingFee;

    // Apply coupon if provided (re-calculate for security)
    const { couponCode } = req.body;
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
      if (coupon) {
        const now = new Date();
        if (coupon.isActive && now >= coupon.startDate && now <= coupon.expiryDate && subtotal >= coupon.minOrderAmount) {
          let discount = 0;
          if (coupon.discountType === 'percentage') {
            discount = (subtotal * coupon.discountValue) / 100;
            if (coupon.maxDiscountAmount && discount > coupon.maxDiscountAmount) discount = coupon.maxDiscountAmount;
          } else {
            discount = coupon.discountValue;
          }
          if (discount > subtotal) discount = subtotal;
          totalAmount -= discount;
        }
      }
    }

    totalAmount = Math.max(1, Math.round(totalAmount)); // Ensure at least 1 for Razorpay

    const options = {
      amount: totalAmount * 100,
      currency: "INR",
      receipt: "receipt_order_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);
    res.json({ ...order, verifiedAmount: totalAmount });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Order creation failed" });
  }
};

// 2. Verify & SAVE Order
exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      shippingAddress,
      saveAddressInfo,
      couponCode
    } = req.body;

    const userId = req.user.id;

    // A. Verify Signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ message: "Payment verification failed" });
    }

    // B. Order Creation Logic
    const user = await User.findById(userId).populate('cart.product');
    if (!user || user.cart.length === 0) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    let subtotal = 0;
    const orderItems = [];

    for (const item of user.cart) {
      if (!item.product) continue;
      const price = (item.product.discount && item.product.discount > 0) ? item.product.discount : item.product.price;
      subtotal += price * item.quantity;

      // Stock Check
      const unitWeight = parseWeight(item.product.weight);
      if (unitWeight > 0) {
        const requiredStock = unitWeight * item.quantity;
        if (item.product.totalStock < requiredStock) {
          return res.status(400).json({ message: `Insufficient stock for ${item.product.name}` });
        }
      } else {
        let available = item.product.stockQty || 0;
        if (available === 0 && item.product.totalStock > 0) {
          if (item.product.totalStock >= 1000) available = Math.floor(item.product.totalStock / 1000);
          else available = item.product.totalStock;
        }
        if (available < item.quantity) {
          return res.status(400).json({ message: `Insufficient stock for ${item.product.name}` });
        }
      }

      orderItems.push({
        product: item.product._id,
        name: item.product.name,
        price: price,
        quantity: item.quantity,
        image: item.product.images && item.product.images.length > 0 ? item.product.images[0] : (item.product.image || '')
      });
    }

    const deliveryCharge = subtotal > 2000 ? 0 : 25;
    const handlingFee = 2;
    let totalAmount = subtotal + deliveryCharge + handlingFee;
    let discountAmount = 0;
    let couponToUpdate = null;

    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
      if (coupon) {
        const now = new Date();
        const isValid = coupon.isActive && now >= coupon.startDate && now <= coupon.expiryDate && subtotal >= coupon.minOrderAmount;
        if (isValid) {
          if (coupon.discountType === 'percentage') {
            discountAmount = (subtotal * coupon.discountValue) / 100;
            if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) discountAmount = coupon.maxDiscountAmount;
          } else {
            discountAmount = coupon.discountValue;
          }
          if (discountAmount > subtotal) discountAmount = subtotal;
          totalAmount -= discountAmount;
          couponToUpdate = coupon;
        }
      }
    }

    totalAmount = Math.max(0, Math.round(totalAmount));
    discountAmount = Math.round(discountAmount);

    // C. Save Order
    const newOrder = new Order({
      user: userId,
      items: orderItems,
      shippingAddress,
      paymentMethod: 'Razorpay',
      paymentStatus: 'Completed',
      subtotal,
      deliveryCharge,
      handlingFee,
      totalAmount,
      couponCode: couponToUpdate ? couponToUpdate.code : null,
      discountAmount
    });

    const savedOrder = await newOrder.save();

    // D. Update Coupon Usage
    if (couponToUpdate) {
      couponToUpdate.usedCount += 1;
      couponToUpdate.usedUsers.push(userId);
      await couponToUpdate.save();
    }

    // E. Update Stock Details
    for (const item of orderItems) {
      const product = await Product.findById(item.product);
      if (product) {
        const unitWeight = parseWeight(product.weight);
        if (unitWeight > 0) {
          product.totalStock = Math.max(0, product.totalStock - (unitWeight * item.quantity));
          product.stockQty = Math.floor(product.totalStock / unitWeight);
        } else {
          let deductionUnit = 1;
          if ((!product.stockQty || product.stockQty === 0) && product.totalStock > 0) {
            if (product.totalStock >= 1000) deductionUnit = 1000;
          }
          const deductionAmount = item.quantity * deductionUnit;
          if (product.totalStock >= deductionAmount) {
            product.totalStock = Math.max(0, product.totalStock - deductionAmount);
            if (product.totalStock >= 1000) product.stockQty = Math.floor(product.totalStock / 1000);
            else product.stockQty = product.totalStock;
          } else if (product.stockQty >= item.quantity) {
            product.stockQty -= item.quantity;
          }
        }

        if (product.stockQty === 0 && product.totalStock === 0) product.status = 'Out of Stock';
        else if (product.initialStock > 0 && product.totalStock <= (product.initialStock * 0.2)) product.status = 'Low Stock';
        else product.status = 'In Stock';

        await product.save();
      }
    }

    // F. Clear Cart
    user.cart = [];
    await user.save();

    // G. Save Address if requested
    if (saveAddressInfo) {
      const existingAddress = await Address.findOne({
        user: userId,
        streetAddress: shippingAddress.streetAddress,
        city: shippingAddress.city,
        firstName: shippingAddress.firstName
      });
      if (!existingAddress) {
        const addressCount = await Address.countDocuments({ user: userId });
        await Address.create({
          user: userId,
          ...shippingAddress,
          isDefault: addressCount === 0
        });
      }
    }

    return res.json({ message: "Order placed successfully", order: savedOrder });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Verification & Order Creation failed" });
  }
};
