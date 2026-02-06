const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");

const contactController = require('../controllers/contactController');
const adminController = require('../controllers/adminController');

router.get("/dashboard", auth, role("admin"), (req, res) => {
  res.json({ message: "Welcome Admin" });
});

router.get('/stats', auth, role('admin'), adminController.getDashboardStats);
router.get('/customers', auth, role('admin'), adminController.getAllCustomers);
router.delete('/customers/:id', auth, role('admin'), adminController.deleteCustomer);
router.get('/customers/:id', auth, role('admin'), adminController.getCustomerDetails);
router.get('/transactions', auth, role('admin'), adminController.getAllTransactions);
router.get('/notifications', auth, role('admin'), adminController.getNotifications);

// Message Routes
router.get('/messages', auth, role('admin'), contactController.getAllMessages);
router.put('/message/:id/read', auth, role('admin'), contactController.markAsRead);
router.post('/message/:id/reply', auth, role('admin'), contactController.replyMessage);

module.exports = router;
