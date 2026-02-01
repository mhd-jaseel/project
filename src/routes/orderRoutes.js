const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const protect = require('../middleware/authMiddleware');
const role = require('../middleware/roleMiddleware');

// User Routes
router.post('/place', protect, orderController.placeOrder);
router.get('/myorders', protect, orderController.getMyOrders);

// Admin Routes
router.get('/all', protect, role('admin'), orderController.getAllOrders);
router.put('/:orderId/status', protect, role('admin'), orderController.updateOrderStatus);

module.exports = router;
