const jwt = require('jsonwebtoken');
const db = require('../config/database');

module.exports = async function authenticatePartner(req, res, next) {
    const reject = (status, message) => req.path.startsWith('/api/')
        ? res.status(status).json({ error: message })
        : res.redirect('/employee/login');
    try {
        const token = req.cookies?.employee_token;
        if (!token) return reject(401, 'Vui lòng đăng nhập lại tài khoản CTV.');
        const payload = jwt.verify(token, process.env.ACCESS_SECRET_KEY);
        if (payload.role !== 'employee') return reject(403, 'Tài khoản này không có quyền CTV.');
        const [rows] = await db.query('SELECT id, name, username, phone, email, address, active FROM employee WHERE id = ?', [payload.id]);
        if (!rows[0] || !rows[0].active) return reject(403, 'Tài khoản CTV chưa được duyệt hoặc đã tạm khóa.');
        req.employee = { ...payload, ...rows[0] };
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') return reject(401, 'Phiên đăng nhập CTV đã hết hạn. Vui lòng đăng nhập lại.');
        next(error);
    }
};
