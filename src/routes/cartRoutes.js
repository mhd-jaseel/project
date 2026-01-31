const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const protect = require('../middleware/authMiddleware');

// All cart routes should be protected
router.use(protect);

router.get('/', cartController.getCart);
router.post('/', cartController.addToCart);
router.put('/', cartController.updateCartItem);
router.delete('/:id', cartController.removeFromCart);
router.delete('/', cartController.clearCart);

module.exports = router;
