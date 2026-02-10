const Address = require('../models/Address');

exports.saveAddress = async (req, res) => {
    try {
        const { firstName, companyName, streetAddress, apartment, city, phoneNumber, email } = req.body;
        const userId = req.user.id;  //take the logged user id  

        // Check if this is the first address
        const addressCount = await Address.countDocuments({ user: userId });
        const isDefault = addressCount === 0;//if this is the first address make it as default

        const newAddress = new Address({
            user: userId,
            firstName,
            companyName,
            streetAddress,
            apartment,
            city,
            phoneNumber,
            email,
            isDefault
        });

        const savedAddress = await newAddress.save();
        res.status(201).json(savedAddress);
    } catch (error) {
        console.error("Error saving address:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

//function for get all user addresses

exports.getAddresses = async (req, res) => {
    try {
        // Sort by isDefault (descending -> true first) then createdAt (descending -> newest first)
        const addresses = await Address.find({ user: req.user.id }).sort({ isDefault: -1, createdAt: -1 });
        res.json(addresses);
    } catch (error) {
        console.error("Error fetching addresses:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

//function to change default address

exports.setDefaultAddress = async (req, res) => {
    try {
        const { addressId } = req.params;   //gets addree id from URL
        const userId = req.user.id;

        // remove default from all addresses
        await Address.updateMany({ user: userId }, { isDefault: false });

        // Set new default
        const updatedAddress = await Address.findOneAndUpdate(
            { _id: addressId, user: userId },//ensure address belongs to the user
            { isDefault: true },
            { new: true }
        );

        //cheks if address exists
        if (!updatedAddress) {
            return res.status(404).json({ message: "Address not found" });
        }
        res.json(updatedAddress);
    } catch (error) {
        console.error("Error setting default address:", error);
        res.status(500).json({ message: "Server Error" });
    }
};


//function for edit address
exports.updateAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        const userId = req.user.id;
        const updates = req.body;  //retrieving data to update
                
        //finds and update address 
        const updatedAddress = await Address.findOneAndUpdate(
            { _id: addressId, user: userId },
            updates,
            { new: true }
        );

        if (!updatedAddress) {
            return res.status(404).json({ message: "Address not found" });
        }

        res.json(updatedAddress);
    } catch (error) {
        console.error("Error updating address:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
    
exports.deleteAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        const userId = req.user.id;

        const deletedAddress = await Address.findOneAndDelete({ _id: addressId, user: userId });

        if (!deletedAddress) {
            return res.status(404).json({ message: "Address not found" });
        }

        res.json({ message: "Address deleted successfully" });
    } catch (error) {
        console.error("Error deleting address:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
