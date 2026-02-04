const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const protect = require('../middleware/authMiddleware');
const role = require('../middleware/roleMiddleware');

// User Routes
router.post('/place', protect, orderController.placeOrder);
router.get('/myorders', protect, orderController.getMyOrders);
router.get('/mycancellations', protect, orderController.getMyCancellations);
router.get('/myreturns', protect, orderController.getMyReturns);
router.put('/:orderId/cancel', protect, orderController.cancelOrder);
router.put('/:orderId/return', protect, orderController.requestReturn);
router.put('/:orderId/items/:itemId/cancel', protect, orderController.cancelOrderItem);
router.put('/:orderId/items/:itemId/return', protect, orderController.requestItemReturn);

// Admin Routes
router.get('/all', protect, role('admin'), orderController.getAllOrders);
router.put('/:orderId/status', protect, role('admin'), orderController.updateOrderStatus);
router.put('/:orderId/return-status', protect, role('admin'), orderController.updateReturnStatus);
router.put('/:orderId/items/:itemId/return-status', protect, role('admin'), orderController.updateItemReturnStatus);
router.put('/:orderId/viewed', protect, role('admin'), orderController.markOrderViewed);

module.exports = router;
