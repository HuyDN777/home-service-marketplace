const db = require('../../config/database');
const marketplace = require('../../services/jobMarketplace');
const { calculatePartnerEarning, calculatePlatformCommission, confirmCashCollection } = require('../../services/partnerEarnings');
const { createInspectionQuote } = require('../../services/inspectionQuote');
const { publish } = require('../../services/realtime');
const { canStartOrder, EARLY_START_MINUTES } = require('../../services/orderPolicy');

const orderController = {
    async getAvailableJobs(req, res) {
        try {
            const orders = await marketplace.listAvailableJobs(req.employee.id);
            res.json({ orders: orders.map(order => ({ ...order, expected_earning: calculatePartnerEarning(order.final_amount, order.commissionable_amount) })) });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.status ? error.message : 'Khong tai duoc cong viec' });
        }
    },

    async claimJob(req, res) {
        try {
            const order = await marketplace.claimJob(req.params.id, req.employee.id);
            publish('orders_changed', { order_id: Number(req.params.id) });
            res.json({ message: 'Da nhan ca lam', order });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.status ? error.message : 'Khong the nhan ca' });
        }
    },

    async rejectJob(req, res) {
        try {
            const result = await marketplace.rejectJob(req.params.id, req.employee.id, req.body?.reason);
            res.json({ message: 'Đã bỏ qua công việc này', result });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.status ? error.message : 'Không thể từ chối công việc' });
        }
    },

    async cancelJob(req, res) {
        try {
            const result = await marketplace.cancelClaimedJob(req.params.id, req.employee.id, req.body?.reason);
            publish('orders_changed', { order_id: Number(req.params.id) });
            res.json({ message: 'Đã trả ca về danh sách việc mở', result });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.status ? error.message : 'Không thể hủy ca' });
        }
    },

    async rejectionStats(req, res) {
        try {
            res.json(await marketplace.getRejectionStats(req.employee.id));
        } catch (error) {
            res.status(500).json({ error: 'Không tải được thống kê từ chối' });
        }
    },

    async getOrders(req, res) {
        try {
            const [orders] = await db.query(`
                SELECT o.id, o.start_datetime, o.end_datetime, o.actual_started_at, o.actual_finished_at,
                    o.status, o.address, o.note, o.final_amount, o.commissionable_amount,
                    o.payment_method, o.payment_status, o.cash_collected_at, u.name AS customer_name,
                    u.phone AS customer_phone, s.name AS service_name, s.pricing_model,
                    CASE WHEN parent_quote.id IS NULL THEN 0 ELSE 1 END AS is_repair
                FROM \`order\` o
                LEFT JOIN user u ON o.Userid = u.id
                LEFT JOIN service s ON o.Serviceid = s.id
                LEFT JOIN service_quote parent_quote ON parent_quote.repair_order_id = o.id
                WHERE o.Employeeid = ? AND o.status IN ('ASSIGNED', 'IN_PROGRESS', 'WORK_DONE', 'DISPUTED')
                ORDER BY o.start_datetime ASC
            `, [req.employee.id]);
            res.json({ orders: orders.map(order => ({ ...order, expected_earning: calculatePartnerEarning(order.final_amount, order.commissionable_amount) })) });
        } catch (error) {
            res.status(500).json({ error: 'Khong tai duoc lich lam viec' });
        }
    },

    async getOrderHistory(req, res) {
        try {
            const [orders] = await db.query(`
                SELECT o.id, o.start_datetime, o.end_datetime, o.status, o.address, o.note,
                    o.final_amount, o.commissionable_amount, o.payment_method, o.payment_status,
                    o.cash_collected_at, u.name AS customer_name, u.phone AS customer_phone,
                    s.name AS service_name,
                    wt.amount AS partner_earning
                FROM \`order\` o
                LEFT JOIN user u ON o.Userid = u.id
                LEFT JOIN service s ON o.Serviceid = s.id
                LEFT JOIN partner_wallet_transaction wt
                    ON wt.Orderid = o.id AND wt.Employeeid = o.Employeeid
                    AND wt.type IN ('JOB_EARNING', 'CANCELLATION_COMPENSATION')
                WHERE o.Employeeid = ? AND o.status IN ('COMPLETED', 'CANCELLED')
                ORDER BY COALESCE(o.cancelled_at, o.end_datetime) DESC
                LIMIT 100
            `, [req.employee.id]);
            const [[summary]] = await db.query(`
                SELECT e.partner_balance,
                    COALESCE(SUM(CASE WHEN wt.type = 'CANCELLATION_COMPENSATION' THEN wt.amount ELSE 0 END), 0) AS cancellation_compensation,
                    COALESCE(SUM(CASE WHEN wt.type = 'JOB_EARNING' THEN wt.amount ELSE 0 END), 0) AS job_earnings
                FROM employee e
                LEFT JOIN partner_wallet_transaction wt ON wt.Employeeid = e.id
                WHERE e.id = ?
                GROUP BY e.id, e.partner_balance
            `, [req.employee.id]);
            const [completed] = await db.query(`SELECT final_amount, commissionable_amount, payment_method, cash_collected_at FROM \`order\`
                WHERE Employeeid = ? AND status = 'COMPLETED'`, [req.employee.id]);
            const platformCommission = completed.filter(order => order.payment_method === 'CASH' && order.cash_collected_at)
                .reduce((sum, order) => sum + calculatePlatformCommission(order.commissionable_amount ?? order.final_amount), 0);
            const normalizedOrders = orders.map(order => ({
                ...order,
                partner_earning: order.partner_earning === null ? null : Number(order.partner_earning),
                expected_earning: calculatePartnerEarning(order.final_amount, order.commissionable_amount)
            }));
            res.json({ orders: normalizedOrders, summary: {
                partner_balance: Number(summary?.partner_balance || 0),
                job_earnings: Number(summary?.job_earnings || 0),
                cancellation_compensation: Number(summary?.cancellation_compensation || 0),
                platform_commission: platformCommission,
                completed_jobs: completed.length
            } });
        } catch (error) {
            res.status(500).json({ error: 'Không tải được lịch sử công việc' });
        }
    },

    async getRepairCatalog(req, res) {
        try {
            const [items] = await db.query(`SELECT r.id, r.name, r.unit, r.labor_price
                FROM repair_catalog_item r JOIN employee e ON e.Serviceid = r.Serviceid
                WHERE e.id = ? AND r.active = 1 ORDER BY r.name`, [req.employee.id]);
            res.json({ items });
        } catch (error) {
            res.status(500).json({ error: 'Không tải được bảng giá công' });
        }
    },

    async startOrder(req, res) {
        try {
            const [assigned] = await db.query(
                "SELECT start_datetime FROM `order` WHERE id = ? AND Employeeid = ? AND status = 'ASSIGNED'",
                [req.params.id, req.employee.id]
            );
            if (!assigned.length) return res.status(409).json({ error: 'Ca không ở trạng thái đã nhận' });
            if (!canStartOrder(assigned[0].start_datetime)) {
                return res.status(409).json({ error: `Chỉ có thể bắt đầu trước giờ hẹn ${EARLY_START_MINUTES} phút` });
            }
            const [running] = await db.query(
                "SELECT id FROM `order` WHERE Employeeid = ? AND status = 'IN_PROGRESS' AND id <> ? LIMIT 1",
                [req.employee.id, req.params.id]
            );
            if (running.length) return res.status(409).json({ error: 'Bạn vẫn còn một ca đang thực hiện' });
            const [result] = await db.query(
                "UPDATE `order` SET status = 'IN_PROGRESS', actual_started_at = NOW() WHERE id = ? AND Employeeid = ? AND status = 'ASSIGNED'",
                [req.params.id, req.employee.id]
            );
            if (!result.affectedRows) return res.status(409).json({ error: 'Ca khong o trang thai da nhan' });
            publish('orders_changed', { order_id: Number(req.params.id) });
            res.json({ message: 'Da bat dau cong viec' });
        } catch (error) {
            res.status(500).json({ error: 'Khong the bat dau ca' });
        }
    },

    async finishOrder(req, res) {
        try {
            const [orders] = await db.query(`SELECT o.id, s.pricing_model,
                CASE WHEN q.id IS NULL THEN 0 ELSE 1 END AS is_repair FROM \`order\` o
                JOIN service s ON s.id = o.Serviceid
                LEFT JOIN service_quote q ON q.repair_order_id = o.id
                WHERE o.id = ? AND o.Employeeid = ? AND o.status = 'IN_PROGRESS'`, [req.params.id, req.employee.id]);
            if (!orders.length) return res.status(409).json({ error: 'Ca chưa được bắt đầu' });
            if (orders[0].pricing_model === 'INSPECTION' && !orders[0].is_repair) {
                await createInspectionQuote(req.params.id, req.employee.id, req.body);
                publish('orders_changed', { order_id: Number(req.params.id) });
                return res.json({ message: 'Đã gửi báo giá cho khách hàng' });
            }
            const confirmationHours = Math.max(1, Number(process.env.CUSTOMER_CONFIRMATION_HOURS || 24));
            const [result] = await db.query(`UPDATE \`order\` SET status = 'WORK_DONE', actual_finished_at = NOW(),
                confirmation_due_at = DATE_ADD(NOW(), INTERVAL ${confirmationHours} HOUR)
                WHERE id = ? AND Employeeid = ? AND status = 'IN_PROGRESS'`, [req.params.id, req.employee.id]);
            if (!result.affectedRows) return res.status(409).json({ error: 'Ca chua duoc bat dau' });
            publish('orders_changed', { order_id: Number(req.params.id) });
            res.json({ message: 'Đã hoàn tất, chờ khách xác nhận' });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.status ? error.message : 'Không thể hoàn tất ca' });
        }
    },

    async confirmCash(req, res) {
        try {
            const result = await confirmCashCollection(req.params.id, req.employee.id);
            publish('orders_changed', { order_id: Number(req.params.id) });
            res.json({ message: result.already_confirmed ? 'Khoản tiền mặt đã được xác nhận trước đó' : 'Đã xác nhận thu tiền và cấn trừ ví', result });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.status ? error.message : 'Không thể xác nhận thu tiền mặt' });
        }
    }
};

module.exports = orderController;
