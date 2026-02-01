const express = require('express');
const router = express.Router();
const addressController = require('../controllers/addressController');
const protect = require('../middleware/authMiddleware');

router.post('/', protect, addressController.saveAddress);
router.get('/', protect, addressController.getAddresses);

module.exports = router;
