const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");

const contactController = require('../controllers/contactController');

router.get("/dashboard", auth, role("admin"), (req, res) => {
  res.json({ message: "Welcome Admin" });
});

// Message Routes
router.get('/messages', auth, role('admin'), contactController.getAllMessages);
router.put('/message/:id/read', auth, role('admin'), contactController.markAsRead);
router.post('/message/:id/reply', auth, role('admin'), contactController.replyMessage);

module.exports = router;
