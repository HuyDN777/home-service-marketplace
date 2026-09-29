const express = require("express");
const app = express();
const { authenticateTokenWithHeader: authenticate } = require("../middleware/authUser")
const orderController = require("../controllers/user/orderController");
const serviceController = require("../controllers/user/serviceController");
const profileController = require("../controllers/user/profileController");
const { avatarUpload } = require('../config/cloudinary');
const feedbackController = require("../controllers/user/feedbackController");
const authController = require("../controllers/user/authController");
const promotionController = require("../controllers/admin/promotionController");
const cookieParser = require('cookie-parser');
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/api/register', authController.register);
app.post('/api/login', authController.login);
app.get("/", (req, res) => { 
    res.render("users/home", { 
        title: "Home", 
        user: req.user || null, 
        token: req.cookies?.token || null 
    });
});

app.get("/home", (req, res) => {
    res.render("users/home", { 
        title: "Home", 
        user: req.user,
        token: req.cookies.token
    });
});
app.get("/services", (req, res) => {
    res.render("users/services", { title: "Services" });
});
app.get('/register', (req, res) => res.render('users/register'));
app.get('/login', (req, res) => res.render('users/login'));
app.get('/forgot-password', (req, res) => res.render('users/forgot_password'));
app.get('/reset-password', (req, res) => res.render('users/reset_password'));
app.get('/price', (req, res) => res.render('users/price'));
app.get('/order', (req, res) => res.render('users/order'));
app.post('/api/orders', authenticate, orderController.order);
app.get('/order-history', (req, res) => {
    res.render('users/order_history');
});
app.post('/api/feedback', authenticate, feedbackController.sendFeedback);
app.get("/api/services", serviceController.getServices);

app.get('/api/user/profile', authenticate, profileController.getProfile);
app.post('/api/user/avatar', authenticate, (req, res, next) => {
    avatarUpload.single('image')(req, res, err => {
        if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Ảnh tối đa 5 MB' : err.message });
        next();
    });
}, profileController.updateAvatar);

app.put('/api/user/profile-update', authenticate, profileController.updateProfile);

app.put('/api/user/change-password', authenticate, profileController.changePassword);
app.get('/profile', async (req, res) => {
    res.render('users/profile', { title: "Profile" });
});
app.get('/api/vnpay/vnpay-return', orderController.orderProcessing);
app.get('/api/vnpay/vnpay-ipn', orderController.vnpayIpn);
app.get('/order-success/:orderId', orderController.orderSuccessful);
app.get('/api/user/orders/history', authenticate, orderController.orderHistory);
app.get('/api/user/debt', authenticate, orderController.debtSummary);
app.post('/api/user/debt/pay', authenticate, orderController.payDebt);
app.put('/api/user/orders/:id/confirm', authenticate, orderController.confirmOrder);
app.put('/api/user/orders/:id/dispute', authenticate, orderController.disputeOrder);
app.put('/api/user/orders/:id/quote', authenticate, orderController.respondToQuote);
app.put('/api/user/orders/:id/cancel', authenticate, orderController.cancelOrder);
app.put('/api/user/orders/:id/refund-status', authenticate, orderController.refundStatus);
// router.get('/api/momo/momo-return', orderUserController.orderProcessing);
app.get("/api/services/search", serviceController.search);
app.post('/api/user/forgot-password', profileController.forgotPassword);
app.post('/api/user/verify-otp', profileController.verifyOTP);
app.post('/api/user/reset-password', profileController.resetPassword);
app.get('/api/coupons', promotionController.getPromotionAvailable);
module.exports = app;
