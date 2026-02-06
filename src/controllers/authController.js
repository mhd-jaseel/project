const User = require("../models/User");
const Wallet = require("../models/Wallet");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

// Mail setup
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// OTP generator
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

/* ======================
   REGISTER (SIGNUP)
====================== */
exports.register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (await User.findOne({ email })) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();

    const user = await User.create({
      name,
      email,
      phoneNumber: phone,
      password: hashedPassword,
      otp,
      otpExpiry: Date.now() + 5 * 60 * 1000,
      otpPurpose: "signup",
      isEmailVerified: false
    });

    // Create Wallet
    await Wallet.create({ user: user._id });

    await transporter.sendMail({
      to: email,
      subject: "Verify your email",
      text: `Your OTP is ${otp}. Valid for 5 minutes.`
    });


    res.status(201).json({
      message: "OTP sent to email",
      email,
      purpose: "signup"
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ======================
   LOGIN
====================== */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({
        message: "Email not verified",
        email,
        purpose: "signup"
      });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ token, role: user.role });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ======================
   VERIFY OTP
====================== */
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp, purpose } = req.body;

    const user = await User.findOne({
      email,
      otp: String(otp),
      otpPurpose: purpose,
      otpExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    if (purpose === "signup") {
      user.isEmailVerified = true;
    }

    if (purpose === "forgot-password") {
      const resetToken = crypto.randomBytes(32).toString("hex");
      user.resetToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");
      user.resetTokenExpiry = Date.now() + 15 * 60 * 1000;

      user.otp = undefined;
      user.otpExpiry = undefined;
      user.otpPurpose = undefined;
      await user.save();

      return res.json({ message: "OTP verified", resetToken });
    }

    user.otp = undefined;
    user.otpExpiry = undefined;
    user.otpPurpose = undefined;
    await user.save();

    res.json({ message: "Email verified successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ======================
   FORGOT PASSWORD
====================== */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = Date.now() + 5 * 60 * 1000;
    user.otpPurpose = "forgot-password";
    await user.save();

    await transporter.sendMail({
      to: email,
      subject: "Password Reset OTP",
      text: `Your OTP is ${otp}`
    });

    res.json({ message: "OTP sent", email, purpose: "forgot-password" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ======================
   RESET PASSWORD
====================== */
exports.resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    const user = await User.findOne({
      resetToken: hashedToken,
      resetTokenExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    user.password = await bcrypt.hash(newPassword, 10);

    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ======================
   GET WALLET
====================== */
exports.getWalletBalance = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user.id });
    res.json({ balance: wallet ? wallet.balance : 0 });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

/* ======================
   GET PROFILE
====================== */
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -otp -otpExpiry -resetToken");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ======================
   UPDATE PROFILE
====================== */
exports.updateProfile = async (req, res) => {
  try {
    const { name, email, phoneNumber, password } = req.body;
    const updates = {};

    if (name) updates.name = name;
    if (email) updates.email = email;
    if (phoneNumber) updates.phoneNumber = phoneNumber;

    if (password) {
      updates.password = await bcrypt.hash(password, 10);
    }

    // Handle Profile Picture
    if (req.file) {
      // Assuming static files are served from /uploads
      updates.profilePicture = `/uploads/products/${req.file.filename}`;
    }

    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select("-password");

    res.json({ message: "Profile updated successfully", user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ======================
   CHANGE EMAIL
====================== */
exports.changeEmail = async (req, res) => {
  try {
    const { oldEmail, newEmail } = req.body;
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (user.email !== oldEmail) {
      return res.status(400).json({ message: "Old email does not match." });
    }

    const emailExists = await User.findOne({ email: newEmail });
    if (emailExists) {
      return res.status(400).json({ message: "New email is already in use." });
    }

    user.email = newEmail;
    await user.save();

    // Send notification
    try {
      await transporter.sendMail({
        to: newEmail,
        subject: "Email Changed Successfully",
        text: "Your Admin account email has been updated successfully."
      });
    } catch (mailError) {
      console.error("Mail error:", mailError);
    }

    res.json({ message: "Email updated successfully. Notification sent.", user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ======================
   CHANGE PASSWORD
====================== */
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;
    const user = await User.findById(userId);

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Incorrect old password." });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    // Send notification
    try {
      await transporter.sendMail({
        to: user.email,
        subject: "Password Changed Successfully",
        text: "Your account password has been updated successfully."
      });
    } catch (mailError) {
      console.error("Mail error:", mailError);
    }

    res.json({ message: "Password updated successfully. Notification sent." });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
