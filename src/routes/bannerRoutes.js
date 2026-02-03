const express = require('express');
const router = express.Router();
const bannerController = require('../controllers/bannerController');
const protect = require('../middleware/authMiddleware');
const role = require('../middleware/roleMiddleware');
const upload = require('../middleware/bannerUpload');

// Public Route
router.get('/active', bannerController.getActiveBanners);

// Admin Routes
router.get('/all', protect, role('admin'), bannerController.getAllBanners);
router.post('/add', protect, role('admin'), upload.single('image'), bannerController.addBanner);
router.put('/:bannerId/toggle', protect, role('admin'), bannerController.toggleBannerStatus);
router.delete('/:bannerId', protect, role('admin'), bannerController.deleteBanner);

module.exports = router;
