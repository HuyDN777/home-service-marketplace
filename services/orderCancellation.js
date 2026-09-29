const db = require('../config/database');

const LATE_WINDOW_MS = 2 * 60 * 60 * 1000;
const CANCELLATION_FEE_RATE = Number(process.env.CANCELLATION_FEE_RATE || 0.20);
const PARTNER_SHARE_RATE = Number(process.env.PARTNER_CANCELLATION_SHARE_RATE || 0.80);

class CancellationError extends Error {
    constructor(message, status = 409) {
        super(message);
        this.status = status;
    }
}

async function cancelByCustomer(orderId, userId, reason, database = db, now = new Date()) {
    const connection = await database.getConnection();
    try {
        await connection.beginTransaction();
        const [orders] = await connection.query(
            'SELECT id, Userid, Employeeid, status, start_datetime, payment_method, payment_status, final_amount FROM `order` WHERE id = ? FOR UPDATE',
            [orderId]
        );
        const order = orders[0];
        if (!order || Number(order.Userid) !== Number(userId)) throw new CancellationError('Không tìm thấy đơn hàng', 404);
        if (!['PENDING', 'OFFERED', 'ASSIGNED'].includes(order.status)) {
            throw new CancellationError('Đơn ở trạng thái này không thể hủy trực tiếp');
        }

        const startsAt = new Date(order.start_datetime);
        if (startsAt <= now) throw new CancellationError('Ca đã bắt đầu, vui lòng liên hệ hỗ trợ');
        const late = startsAt.getTime() - now.getTime() <= LATE_WINDOW_MS;
        const hasPartner = order.status === 'ASSIGNED' && order.Employeeid !== null;
        const total = Number(order.final_amount) || 0;
        const fee = late && hasPartner ? Math.round(total * CANCELLATION_FEE_RATE) : 0;
        const compensation = Math.round(fee * PARTNER_SHARE_RATE);
        const platformAmount = fee - compensation;
        const feeStatus = fee === 0 ? 'NOT_APPLICABLE' : order.payment_method === 'CASH' ? 'UNPAID' : 'COLLECTED';

        await connection.query(
            `UPDATE \`order\` SET status = 'CANCELLED', cancelled_by = 'CUSTOMER',
                cancellation_reason = ?, cancelled_at = NOW(),
                payment_status = CASE WHEN payment_method = 'ONLINE' AND payment_status = 'PAID' THEN 'PENDING_REFUND' ELSE payment_status END
             WHERE id = ?`,
            [reason || null, order.id]
        );
        await connection.query(
            `INSERT INTO order_cancellation
                (Orderid, cancelled_by, reason, fee_amount, partner_compensation, platform_amount, fee_status)
             VALUES (?, 'CUSTOMER', ?, ?, ?, ?, ?)`,
            [order.id, reason || null, fee, compensation, platformAmount, feeStatus]
        );

        if (fee > 0 && order.payment_method === 'CASH') {
            await connection.query(
                `INSERT INTO customer_debt (Userid, Orderid, amount, status, reason)
                 VALUES (?, ?, ?, 'UNPAID', 'LATE_CANCELLATION')`,
                [userId, order.id, fee]
            );
        }
        if (compensation > 0) {
            await connection.query('UPDATE employee SET partner_balance = partner_balance + ? WHERE id = ?', [compensation, order.Employeeid]);
            const [balances] = await connection.query('SELECT partner_balance FROM employee WHERE id = ?', [order.Employeeid]);
            await connection.query(
                `INSERT INTO partner_wallet_transaction
                    (Employeeid, Orderid, type, amount, balance_after, description)
                 VALUES (?, ?, 'CANCELLATION_COMPENSATION', ?, ?, ?)`,
                [order.Employeeid, order.id, compensation, balances[0].partner_balance, `Bồi thường hủy muộn đơn #${order.id}`]
            );
        }

        await connection.commit();
        return {
            id: order.id,
            status: 'CANCELLED',
            payment_method: order.payment_method,
            payment_status: order.payment_method === 'ONLINE' && order.payment_status === 'PAID'
                ? 'PENDING_REFUND'
                : order.payment_status,
            late,
            fee,
            refund_amount: order.payment_method === 'ONLINE' ? total - fee : 0,
            partner_compensation: compensation,
            platform_amount: platformAmount,
            fee_status: feeStatus
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { cancelByCustomer, CancellationError, CANCELLATION_FEE_RATE, PARTNER_SHARE_RATE };
