const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const auth = require('../middleware/authMiddleware');
const role = require('../middleware/roleMiddleware');

// ADMIN ROUTES
// Create new coupon
router.post('/', auth, role('admin'), couponController.createCoupon);

// Get all coupons
router.get('/', auth, role('admin'), couponController.getAllCoupons);

// Update coupon
router.put('/:id', auth, role('admin'), couponController.updateCoupon);

// Delete coupon
router.delete('/:id', auth, role('admin'), couponController.deleteCoupon);


// USER ROUTES
// Apply coupon
// Note: This route doesn't need admin role, just user auth
router.post('/apply', auth, couponController.applyCoupon);

// Get available coupons
router.get('/available', auth, couponController.getAvailableCoupons);

module.exports = router;
