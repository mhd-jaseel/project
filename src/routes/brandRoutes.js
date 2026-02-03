const express = require('express');
const router = express.Router();
const brandController = require('../controllers/brandController');
const protect = require('../middleware/authMiddleware');
const role = require('../middleware/roleMiddleware');
const upload = require('../middleware/brandUpload');

// Public
router.get('/', brandController.getAllBrands);

// Admin
router.post('/add', protect, role('admin'), upload.single('image'), brandController.addBrand);
router.delete('/:brandId', protect, role('admin'), brandController.deleteBrand);

module.exports = router;
