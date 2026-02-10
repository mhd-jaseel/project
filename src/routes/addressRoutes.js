const express = require('express');
const router = express.Router();
const addressController = require('../controllers/addressController');
const protect = require('../middleware/authMiddleware'); //for protect routes

router.post('/', protect, addressController.saveAddress);
router.get('/', protect, addressController.getAddresses);
router.put('/:addressId/default', protect, addressController.setDefaultAddress);
router.put('/:addressId', protect, addressController.updateAddress);
router.delete('/:addressId', protect, addressController.deleteAddress);

module.exports = router;
