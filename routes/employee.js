const express = require("express");
const app = express();
const authenticate = require("../middleware/authEmployee");
const authController = require("../controllers/employee/authController");
const orderController = require("../controllers/employee/orderController");
const profileController = require("../controllers/employee/profileController");

app.get('/login', (req, res) => {
    res.render('employee/login');
})
app.get('/register', authController.registerPage);
app.get('', authenticate, (req, res) => {
    const employee = req.employee;
    res.render('employee/employee', { employee });
})
app.post('/api/login', authController.login);
app.post('/api/logout', (req, res) => { res.clearCookie('employee_token', { sameSite: 'lax', path: '/employee' }); res.json({ ok: true }); });
app.post('/api/register', authController.register);
app.get('/api/profile', authenticate, profileController.getProfile);
app.put('/api/profile-update', authenticate, profileController.updateProfile);
app.put('/api/availability', authenticate, profileController.updateAvailability);
app.get('/api/jobs/available', authenticate, orderController.getAvailableJobs);
app.put('/api/jobs/:id/claim', authenticate, orderController.claimJob);
app.put('/api/jobs/:id/reject', authenticate, express.json(), orderController.rejectJob);
app.put('/api/orders/:id/cancel', authenticate, express.json(), orderController.cancelJob);
app.get('/api/rejections/stats', authenticate, orderController.rejectionStats);
app.get('/api/orders', authenticate, orderController.getOrders);
app.get('/api/orders/history', authenticate, orderController.getOrderHistory);
app.get('/api/repair-catalog', authenticate, orderController.getRepairCatalog);
app.put('/api/orders/:id/start', authenticate, orderController.startOrder);
app.put('/api/orders/:id/finish', authenticate, express.json(), orderController.finishOrder);
app.put('/api/orders/:id/confirm-cash', authenticate, orderController.confirmCash);
app.put('/api/change-password', authenticate, profileController.changePassword);
app.post('/api/forgot-password', profileController.forgotPassword);
app.post('/api/reset-password', profileController.resetPassword);

module.exports = app;
