const User = require("../models/User");
const Wallet = require("../models/Wallet");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const crypto = require("crypto"); //Used to generate secure random tokens (reset password token).

// Mail setup  // Configure email service and authentication for sending mails

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || "gmail",//Use email service from env file, otherwise Gmail
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});// Object used to send emails


// Helper function to generate a secure 6-digit numeric OTP
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();


// Handle successful Google login and return user details with a token
exports.googleLoginSuccess = async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(400).json({ message: "Google authentication failed" });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Redirect to homepage with token
    res.send(`
    <script>
        localStorage.setItem("userToken", "${token}");
        window.location.href = "/";
    </script>
   `);


  } catch (error) {
    console.error("Google Login Error:", error);
    res.status(500).json({ message: "Google login failed" });
  }
};

/* ======================
   REGISTER (SIGNUP)
====================== */
// Register a new user and send an OTP for email verification
exports.register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;  //Get data from request body.

    if (await User.findOne({ email })) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    //Create new user in DB
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



    await transporter.sendMail({
      to: email,
      subject: "Verify your email",
      text: `Your OTP is ${otp}. Valid for 5 minutes.`
    });


    // Create Wallet logic inside the try statement just before success response
    await Wallet.create({ user: user._id, balance: 0 });

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
// Log in a user by verifying their email and password
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });//Searches database for a user with this email
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    if (user.isBlocked) {
      return res.status(403).json({ message: "Your account has been blocked. Please contact support." });
    }

    //Compares entered password with hashed password
    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({
        message: "Email not verified",
        email,
        purpose: "signup"  // Indicates this verification is for signup process

      });
    }
    //Creates a JWT token
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

/* ======================   //Controller function to verify OTPCalled from frontend after user enters OTP    Called from frontend after user enters OTP
   VERIFY OTP
====================== */
// Verify the OTP provided by the user to complete registration or password reset
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp, purpose } = req.body;

    // Find the user whose email, OTP, purpose match and whose OTP is not expired

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
      user.isEmailVerified = true;  //Email verification completed
    }

    if (purpose === "forgot-password") {
      const resetToken = crypto.randomBytes(32).toString("hex");//Generates a secure random token for password reset.[.toString("hex")Converts that random data into a readable string]
      user.resetToken = crypto
        .createHash("sha256")   // Initialize SHA-256 hashing algorithm
        .update(resetToken)     // Add the original reset token to be hashed 
        .digest("hex");        // Convert the hashed result into a hexadecimal string
      user.resetTokenExpiry = Date.now() + 15 * 60 * 1000;

      // Clear OTP data after successful verification to prevent reuse and improve security
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
// Initiate the password reset process by sending an OTP to the user's email
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isBlocked) {
      return res.status(403).json({ message: "Your account has been blocked." });
    }

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = Date.now() + 5 * 60 * 1000;
    user.otpPurpose = "forgot-password";  //// Mark this OTP as password reset OTP (not signup)

    await user.save(); //Saves OTP details in the database.

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
//This runs after OTP verification in forgot-password flow.
// Reset the user's password after successful OTP verification
exports.resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;    //resetToken → received after OTP verification
    //Hash the reset token
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    //Find user with valid reset token
    const user = await User.findOne({
      resetToken: hashedToken,
      resetTokenExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    //Clear reset token
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
//get logged-in user's wallet balance
// Get the current wallet balance for the logged-in user
exports.getWalletBalance = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user.id }); // Find wallet document using the logged-in user's ID (from JWT middleware)
    res.json({ balance: wallet ? wallet.balance : 0 }); //    // Send wallet balance if wallet exists, otherwise send 0
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};


/* ======================
   GET PROFILE
====================== */
// Retrieve the profile details of the logged-in user
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -otp -otpExpiry -resetToken"); // Find user by ID from JWT and exclude sensitive fields
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ======================
   UPDATE PROFILE
====================== */
// Update the profile information for the logged-in user
exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) return res.status(404).json({ message: "User not found" });

    const { name, email, phoneNumber, password } = req.body;
    const updates = {};

    if (name) updates.name = name;
    if (email) updates.email = email;
    if (phoneNumber) updates.phoneNumber = phoneNumber;

    // Only allow password update if NOT Google user
    if (password && !user.googleId) {
      updates.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      updates,
      { new: true }
    ).select("-password");

    res.json({
      message: "Profile updated successfully",
      user: updatedUser
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


/* ======================
   CHANGE EMAIL
====================== */
// Change the user's registered email address
exports.changeEmail = async (req, res) => {
  try {
    const { oldEmail, newEmail } = req.body;
    const userId = req.user.id;
    const user = await User.findById(userId); //Finds the user details from database using ID.

    if (user.email !== oldEmail) {
      return res.status(400).json({ message: "Old email does not match." });
    }

    const emailExists = await User.findOne({ email: newEmail }); //Checks if new email already exists in database.
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
// Change the user's password after verifying the old password
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id; //Gets logged-in user ID from token
    const user = await User.findById(userId);  //Fetches user details from database using ID.

    const isMatch = await bcrypt.compare(oldPassword, user.password); // Compares entered old password with hashed password in database.
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

