const ContactMessage = require('../models/ContactMessage');
const nodemailer = require('nodemailer');

// Send a message (Public)
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
exports.replyMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const { subject, message, to } = req.body; // 'to' is the user email

        if (!subject || !message || !to) {
            return res.status(400).json({ message: 'Subject, message, and recipient are required' });
        }

        // Configure Nodemailer transporter
        const transporter = nodemailer.createTransport({
            service: 'gmail', // Or use specific host/port from env
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to,
            subject: `Re: ${subject}`,
            text: message, // or html: message
        };

        await transporter.sendMail(mailOptions);

        // Update isReplied status
        await ContactMessage.findByIdAndUpdate(id, { isReplied: true });

        res.status(200).json({ message: 'Reply sent successfully' });
    } catch (error) {
        console.error('Error replying to message:', error);
        res.status(500).json({ message: 'Failed to send reply' });
    }
};
