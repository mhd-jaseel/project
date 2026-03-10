const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const ExcelJS = require("exceljs");
const Order = require("../models/Order");
const Product = require("../models/Product")
const Category = require("../models/Category")



// ADMIN LOGIN
// Authenticate the admin and generate a login token
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Find user
    const admin = await User.findOne({ email });
    if (!admin) {
      return res.status(401).json({ message: "Admin not found" });
    }

    // 2. Check role
    if (admin.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    // 3. Check password (bcrypt)

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // 4. Generate token (IMPORTANT)
    const token = jwt.sign(
      {
        id: admin._id,
        role: admin.role, //  MUST be admin
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      user: {
        id: admin._id,
        email: admin.email,
        role: admin.role,
      },
    });

  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// Retrieve information about the currently logged-in admin
exports.getMe = async (req, res) => {
  try {
    const admin = await User.findById(req.user.id).select("-password");
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }
    res.json(admin);
  } catch (err) {
    console.error("Get Me Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
// Get Dashboard Stats
// Calculate and return various statistics for the admin dashboard
exports.getDashboardStats = async (req, res) => {
  try {
    const Order = require('../models/Order');
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ orderStatus: 'Pending' });
    const newCustomers = await User.countDocuments({ role: 'user' });

    // Total Sales (Aggregation) - Only 'Delivered' adds, 'Returned' deducts
    const salesData = await Order.aggregate([
      { $match: { orderStatus: { $in: ['Delivered', 'Returned'] } } },
      {
        $group: {
          _id: null,
          deliveredAmount: {
            $sum: { $cond: [{ $eq: ["$orderStatus", "Delivered"] }, "$totalAmount", 0] }
          },
          returnedAmount: {
            $sum: { $cond: [{ $eq: ["$orderStatus", "Returned"] }, "$totalAmount", 0] }
          }
        }
      }
    ]);
    const totalSales = salesData.length > 0 ? (salesData[0].deliveredAmount - salesData[0].returnedAmount) : 0;

    // Sales Chart
    const timeframe = req.query.timeframe || 'This Week';
    let startDate = new Date();
    let fillCount = 7;
    let step = 'day';
    let groupByFormat = "%Y-%m-%d";

    if (timeframe === 'This Month') {
      startDate.setDate(startDate.getDate() - 30);
      fillCount = 30;
    } else if (timeframe === 'This Year') {
      startDate.setMonth(startDate.getMonth() - 11);
      startDate.setDate(1);
      fillCount = 12;
      step = 'month';
      groupByFormat = "%Y-%m";
    } else { // This Week
      startDate.setDate(startDate.getDate() - 6);
    }

    const salesChartRaw = await Order.aggregate([
      {
        $match: {
          orderStatus: { $in: ['Delivered', 'Returned'] },
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: groupByFormat, date: "$createdAt" } },
          total: {
            $sum: {
              $cond: [{ $eq: ["$orderStatus", "Delivered"] }, "$totalAmount", { $multiply: ["$totalAmount", -1] }]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Fill in missing days/months for smoother chart
    const salesChartData = [];
    const today = new Date();
    for (let i = fillCount - 1; i >= 0; i--) {
      const d = new Date();
      let dateStr, labelStr;

      if (step === 'day') {
        d.setDate(d.getDate() - i);
        dateStr = d.toISOString().split('T')[0];
        // Short day name
        labelStr = d.toLocaleDateString('en-US', { weekday: 'short' });
        if (timeframe === 'This Month') {
          // Include date for month view
          labelStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
      } else {
        d.setMonth(d.getMonth() - i);
        dateStr = d.toISOString().substring(0, 7); // YYYY-MM
        labelStr = d.toLocaleDateString('en-US', { month: 'short' });
      }

      const found = salesChartRaw.find(r => r._id === dateStr);
      salesChartData.push({
        date: dateStr,
        label: labelStr,
        total: found ? found.total : 0
      });
    }

    // Category Chart (Top Selling Categories)
    const categoryChartData = await Order.aggregate([
      { $match: { orderStatus: 'Delivered' } },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "productDetails"
        }
      },
      { $unwind: "$productDetails" },
      {
        $lookup: {
          from: "categories",
          localField: "productDetails.category",
          foreignField: "_id",
          as: "categoryDetails"
        }
      },
      { $unwind: "$categoryDetails" },
      {
        $group: {
          _id: "$categoryDetails.name",
          count: { $sum: "$items.quantity" }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 4 }
    ]);

    // Recent Orders
    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      totalOrders,
      pendingOrders,
      newCustomers,
      totalSales,
      recentOrders,
      salesChartData,
      categoryChartData
    });

  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// Get a list of all registered customers with search and pagination
exports.getAllCustomers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    let pipeline = [
      { $match: { role: 'user' } },
      {
        $addFields: {
          idStr: { $toString: "$_id" }
        }
      }
    ];

    if (search) {
      const regex = new RegExp(search, "i");
      pipeline.push({
        $match: {
          $or: [
            { name: regex },
            { email: regex },
            { phoneNumber: regex },
            { idStr: regex }
          ]
        }
      });
    }

    pipeline.push(
      {
        $lookup: {
          from: "orders",
          localField: "_id",
          foreignField: "user",
          as: "orders"
        }
      },
      {
        $lookup: {
          from: "addresses",
          localField: "_id",
          foreignField: "user",
          as: "addresses"
        }
      },
      {
        $project: {
          name: 1,
          email: 1,
          isBlocked: 1,
          createdAt: 1,
          orderCount: { $size: "$orders" },
          phoneNumber: {
            $ifNull: [
              "$phoneNumber",
              { $ifNull: [{ $arrayElemAt: ["$addresses.phoneNumber", 0] }, "N/A"] }
            ]
          }
        }
      },
      { $sort: { createdAt: -1 } }
    );

    // Get Total Count for Pagination
    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await User.aggregate(countPipeline);
    const totalCustomers = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalCustomers / limit);

    // Apply Pagination
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const users = await User.aggregate(pipeline);

    res.json({
      customers: users,
      currentPage: page,
      totalPages,
      totalCustomers,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    });

  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({ message: "Server Error" });
  }
};


// Permanently delete a customer account from the database
exports.deleteCustomer = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Customer deleted successfully" });
  } catch (error) {
    console.error("Error deleting customer:", error);
    res.status(500).json({ message: "Server Error" });
  }
};


// Block or unblock a customer based on their current status
exports.toggleBlockStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isBlocked } = req.body;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Prevent blocking admin
    if (user.role === 'admin') return res.status(400).json({ message: "Cannot block admin" });

    user.isBlocked = isBlocked;
    await user.save();

    res.json({ message: `User ${isBlocked ? 'blocked' : 'unblocked'} successfully`, isBlocked: user.isBlocked });
  } catch (error) {
    console.error("Error toggling block status:", error);
    res.status(500).json({ message: "Server Error" });
  }
};


// Get a history of all customer transactions with filtering options
exports.getAllTransactions = async (req, res) => {
  try {
    const Order = require('../models/Order');
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    let query = {};

    if (req.query.status && req.query.status !== 'All') {
      query.paymentStatus = req.query.status;
    }
    if (req.query.method && req.query.method !== 'All') {
      query.paymentMethod = req.query.method;
    }

    if (req.query.search) {
      const search = req.query.search.trim();
      const searchRegex = { $regex: search, $options: 'i' };

      query.$or = [
        { 'shippingAddress.fullName': searchRegex },
        { 'shippingAddress.firstName': searchRegex },
        { 'shippingAddress.lastName': searchRegex }
      ];

      // Support searching by partial ID (useful for truncated IDs shown in UI)
      query.$or.push({
        $expr: {
          $regexMatch: {
            input: { $toString: "$_id" },
            regex: search,
            options: "i"
          }
        }
      });
    }

    const totalTransactions = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalTransactions / limit);

    const transactions = await Order.find(query)
      .populate('user', 'name email')
      .select('_id createdAt user shippingAddress totalAmount paymentStatus paymentMethod')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      transactions,
      currentPage: page,
      totalPages,
      totalTransactions
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// Retrieve detailed information for a specific customer
exports.getCustomerDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const Order = require('../models/Order');
    const Address = require('../models/Address');

    const user = await User.findById(id).select('-password -otp -resetToken');
    if (!user) return res.status(404).json({ message: "User not found" });

    const orders = await Order.find({ user: id }).sort({ createdAt: -1 });
    const addresses = await Address.find({ user: id });

    // Calculate Stats
    const totalOrders = orders.length;
    const completedOrders = orders.filter(o => o.orderStatus === 'Delivered').length;
    const cancelledOrders = orders.filter(o => o.orderStatus === 'Cancelled').length;

    let totalSpend = 0;
    // Last 6 months for chart
    const monthlySpend = {};
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // Init last 6 months 0
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`; // "Jan 2026"
      monthlySpend[key] = 0;
    }

    orders.forEach(o => {
      if (o.orderStatus !== 'Cancelled') {
        totalSpend += o.totalAmount;

        if (o.paymentStatus === 'Completed' || o.paymentStatus === 'Pending') { // Count mostly valid spends
          const d = new Date(o.createdAt);
          const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
          if (monthlySpend[key] !== undefined) {
            monthlySpend[key] += o.totalAmount;
          }
        }
      }
    });

    res.json({
      user,
      orders,
      addresses,
      stats: {
        totalOrders,
        completedOrders,
        cancelledOrders,
        totalSpend,
        monthlySpend
      }
    });

  } catch (error) {
    console.error("Error fetching customer details:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// Fetch all notifications for the admin system
exports.getNotifications = async (req, res) => {
  try {
    const Order = require('../models/Order');
    const query = {
      viewedByAdmin: false,
      $or: [
        { orderStatus: 'Pending' },
        { orderStatus: 'Cancelled' },
        { returnStatus: 'Requested' },
        { 'items.returnStatus': 'Requested' }
      ]
    };

    const orders = await Order.find(query).sort({ updatedAt: -1 }).limit(20);
    const notifications = orders.map(order => {
      let msg = 'Update on Order';
      let type = 'info';

      if (order.returnStatus === 'Requested' || order.items.some(i => i.returnStatus === 'Requested')) {
        msg = `Return Request: Order #${order._id.toString().substring(0, 8).toUpperCase()}`;
        type = 'warning';
      } else if (order.orderStatus === 'Cancelled') {
        msg = `Cancelled: Order #${order._id.toString().substring(0, 8).toUpperCase()}`;
        type = 'danger';
      } else if (order.orderStatus === 'Pending') {
        msg = `New Order #${order._id.toString().substring(0, 8).toUpperCase()}`;
        type = 'success';
      }

      return {
        id: order._id,
        message: msg,
        type: type,
        time: order.updatedAt,
        link: 'order-management.html'
      };
    });

    res.json(notifications);
  } catch (error) {
    console.error("Notif Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};
//sales report 


// Generate and download a sales report in Excel format
exports.downloadSalesReportExcel = async (req, res) => {
  try {
    const { from, to } = req.query;

    let filter = { orderStatus: { $in: ["Delivered", "Returned"] } };

    if (from && to) {
      const startDate = new Date(from);
      const endDate = new Date(to);

      if (!isNaN(startDate) && !isNaN(endDate)) {
        endDate.setHours(23, 59, 59, 999);
        filter.createdAt = { $gte: startDate, $lte: endDate };
      }
    }

    const orders = await Order.find(filter)
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sales Report");

    worksheet.addRow(["KM STORE SALES REPORT"]);
    worksheet.addRow([]);

    worksheet.addRow([
      "Order ID",
      "Customer",
      "Email",
      "Date",
      "Status",
      "Payment",
      "Amount"
    ]).font = { bold: true };

    let totalSales = 0;

    orders.forEach(order => {
      let amount = Number(order.totalAmount) || 0;

      if (order.orderStatus === "Returned") {
        totalSales -= amount;
        amount = -amount; // Show as negative in the report
      } else {
        totalSales += amount;
      }

      const userName = order.user ? (order.user.name || order.user.email) : 'Guest';

      worksheet.addRow([
        order._id.toString().slice(-6).toUpperCase(),
        userName,
        order.user?.email || "N/A",
        new Date(order.createdAt).toLocaleDateString(),
        order.orderStatus,
        order.paymentMethod || "N/A",
        amount
      ]);
    });

    worksheet.addRow([]);
    worksheet.addRow(["", "", "", "", "", "Total Sales", totalSales]);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=sales-report.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error("Excel Report Error:", error);
    res.status(500).json({ message: "Error generating report" });
  }
};
// Perform a global search across products, categories, and orders
exports.globalSearchAPI = async (req, res) => {
  try {
    const query = req.query.query?.trim();
    if (!query) return res.json([]);

    const regex = new RegExp(query, "i");

    const [customers, products, orders, categories] = await Promise.all([
      User.find({
        $or: [{ name: regex }, { email: regex }]
      }).limit(5),

      Product.find({ name: regex }).limit(5),

      Order.find({
        $or: [
          { 'shippingAddress.fullName': regex },
          { 'shippingAddress.city': regex },
          { 'shippingAddress.mobileNumber': regex }
        ]
      }).limit(5),

      Category.find({ name: regex }).limit(5)
    ]);

    const results = [];

    customers.forEach(c => {
      results.push({
        type: "Customer",
        title: c.name,
        subtitle: c.email,
        link: `/admin/customer-details.html?id=${c._id}`
      });
    });

    products.forEach(p => {
      results.push({
        type: "Product",
        title: p.name,
        subtitle: `₹${p.price}`,
        link: `/admin/all-products.html?id=${p._id}`
      });
    });

    orders.forEach(o => {
      results.push({
        type: "Order",
        title: `#${o._id.toString().substring(0, 8).toUpperCase()}`,
        subtitle: `${o.shippingAddress?.fullName || 'Guest'} - ${o.orderStatus}`,
        link: `/admin/order-management.html?id=${o._id}`
      });
    });

    categories.forEach(cat => {
      results.push({
        type: "Category",
        title: cat.name,
        subtitle: "",
        link: `/admin/categories.html?id=${cat._id}`
      });
    });

    res.json(results);

  } catch (err) {
    console.log(err);
    res.status(500).json([]);
  }
};
