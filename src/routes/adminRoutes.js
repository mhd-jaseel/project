const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");

router.get("/dashboard", auth, role("admin"), (req, res) => {
  res.json({ message: "Welcome Admin" });
});

module.exports = router;
