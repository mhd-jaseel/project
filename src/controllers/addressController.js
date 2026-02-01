const Address = require('../models/Address');

exports.saveAddress = async (req, res) => {
    try {
        const { firstName, companyName, streetAddress, apartment, city, phoneNumber, email } = req.body;

        const newAddress = new Address({
            user: req.user._id,
            firstName,
            companyName,
            streetAddress,
            apartment,
            city,
            phoneNumber,
            email
        });

        const savedAddress = await newAddress.save();
        res.status(201).json(savedAddress);
    } catch (error) {
        console.error("Error saving address:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

exports.getAddresses = async (req, res) => {
    try {
        const addresses = await Address.find({ user: req.user._id }).sort({ createdAt: -1 });
        res.json(addresses);
    } catch (error) {
        console.error("Error fetching addresses:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
