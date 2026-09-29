const Order = require('../../models/Order');
const { resolveDispute } = require('../../services/orderDispute');
const { publish } = require('../../services/realtime');
const db = require('../../config/database');

const orderController = {
    async getAllOrders(req, res) {
        try {
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 10));
            const offset = (page - 1) * pageSize;
            const orders = await Order.findAll(pageSize, offset);
            const total = await Order.totalOrder();
            const totalPages = Math.ceil(total / pageSize);
            res.render("admin/order_management", { orders, page, totalPages, pageSize, user: req.user, token: req.cookies.token });
            //res.json({ orders });
        } catch (err) {
            return res.status(401).send('Unauthorized');
        }
    },

    async resolveDispute(req, res) {
        try {
            const result = await resolveDispute(req.params.id, req.body.decision, req.body.admin_note);
            publish('orders_changed', { order_id: Number(req.params.id) });
            res.json({ message: result.status === 'COMPLETED' ? 'Đã chốt hoàn thành đơn' : 'Đã chuyển đơn về thực hiện lại', result });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.status ? error.message : 'Không thể xử lý khiếu nại' });
        }
    },

    async getDisputes(req, res) {
        const [disputes] = await db.query(`SELECT d.*, o.status AS order_status, s.name AS service_name,
            u.name AS customer_name, e.name AS employee_name
            FROM order_dispute d JOIN \`order\` o ON o.id = d.Orderid
            LEFT JOIN service s ON s.id = o.Serviceid LEFT JOIN user u ON u.id = o.Userid
            LEFT JOIN employee e ON e.id = o.Employeeid
            ORDER BY CASE d.status WHEN 'OPEN' THEN 0 ELSE 1 END, d.created_at DESC`);
        res.render('admin/dispute_management', { disputes, user: req.user, token: req.cookies.token });
    }
}

module.exports = orderController;
