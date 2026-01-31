const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');

// Public route to send a message
router.post('/send', contactController.sendMessage);

module.exports = router;
