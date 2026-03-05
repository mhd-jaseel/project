const jwt = require("jsonwebtoken");

module.exports = async (req, res, next) => {                  //exporets a middleware function that runs before controllers
  const authHeader = req.headers.authorization;      //takes the Authorization header from the request

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1]; //Splits "Bearer <token>" and extracts the token part.

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);  //Stores the decoded token data

    // Check if user is blocked
    const User = require("../models/User");
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    if (user.isBlocked) {
      return res.status(403).json({ isBlocked: true, message: "Account has been blocked by admin", name: user.name, email: user.email });
    }

    req.user = decoded; // { id, role } place to store logged-in user info // Store verified user details so we can access user id and role later without verifying token again
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid token" });
  }
};
