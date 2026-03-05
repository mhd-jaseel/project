const ContactMessage = require('../models/ContactMessage');
const nodemailer = require('nodemailer');


// Send a message (Public)
// Save a contact message sent by a user from the contact page
exports.sendMessage = async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        if (!name || !email || !subject || !message) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const newMessage = new ContactMessage({
            name,
            email,
            subject,
            message,
        });

        await newMessage.save();

        res.status(201).json({ message: 'Message sent successfully' });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get all messages (Admin)
// Retrieve all contact messages for the admin to review
exports.getAllMessages = async (req, res) => {
    try {
        const messages = await ContactMessage.find().sort({ createdAt: -1 });
        res.status(200).json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Mark message as read (Admin)
// Mark a specific contact message as having been read by the admin
exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const message = await ContactMessage.findByIdAndUpdate(
            id,
            { isRead: true },
            { new: true }
        );

        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }

        res.status(200).json({ message: 'Message marked as read', data: message });
    } catch (error) {
        console.error('Error updating message:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Reply to message (Admin)
// Send an email reply to a user's contact message
exports.replyMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const { subject, message, to } = req.body; // 'to' is the user email

        if (!subject || !message || !to) {
            return res.status(400).json({ message: 'Subject, message, and recipient are required' });
        }

        // Initialize transporter inside for fresh env vars and easier debugging
        // Use 'service: gmail' for best compatibility as verified by the test script
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: (process.env.EMAIL_USER || "").trim(),
                pass: (process.env.EMAIL_PASS || "").trim(),
            },
        });

        const mailOptions = {
            from: (process.env.EMAIL_USER || "").trim(),
            to,
            subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
            text: message,
        };

        try {
            await transporter.verify();
        } catch (verifyError) {
            console.error("Email Service: Verification failed:", verifyError.message);
            throw new Error(`Authentication with Gmail failed: ${verifyError.message}`);
        }

        await transporter.sendMail(mailOptions);



        // Update isReplied status
        await ContactMessage.findByIdAndUpdate(id, { isReplied: true });

        res.status(200).json({ message: 'Reply sent successfully' });
    } catch (error) {
        console.error('Error replying to message details:', error);
        res.status(500).json({
            message: 'Failed to send reply',
            details: error.message
        });
    }
};

