const express = require('express');
const router = express.Router();
const offerController = require('../controllers/offerController');
const protect = require('../middleware/authMiddleware');
const role = require('../middleware/roleMiddleware');
const upload = require('../middleware/upload'); // Using existing upload middleware

// Public route to fetch active offers for homepage
router.get('/active', offerController.getActiveOffers);
router.get('/upcoming', offerController.getUpcomingOffers);

// Admin routes (Create, List All, Delete, Update)
router.post('/', protect, role('admin'), upload.single('image'), offerController.createOffer);
router.get('/', protect, role('admin'), offerController.getAllOffers); // Admin sees all
router.get('/:id', protect, role('admin'), offerController.getOfferById); // Get Single
router.put('/:id', protect, role('admin'), upload.single('image'), offerController.updateOffer); // Update
router.delete('/:id', protect, role('admin'), offerController.deleteOffer);

module.exports = router;
