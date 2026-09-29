const db = require('../config/database');
const { settlePartnerWallet } = require('./partnerEarnings');

class DisputeError extends Error {
    constructor(message, status = 409) {
        super(message);
        this.status = status;
    }
}

async function openDispute(orderId, userId, reason, database = db) {
    const text = String(reason || '').trim();
    if (text.length < 10) throw new DisputeError('Vui lòng mô tả vấn đề ít nhất 10 ký tự', 400);
    const connection = await database.getConnection();
    try {
        await connection.beginTransaction();
        const [[order]] = await connection.query('SELECT id, status FROM `order` WHERE id = ? AND Userid = ? FOR UPDATE', [orderId, userId]);
        if (!order) throw new DisputeError('Không tìm thấy đơn hàng', 404);
        if (order.status !== 'WORK_DONE') throw new DisputeError('Đơn này không còn trong thời gian xác nhận');
        await connection.query(`INSERT INTO order_dispute (Orderid, Userid, reason)
            VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE reason = VALUES(reason), status = 'OPEN',
                admin_note = NULL, created_at = NOW(), resolved_at = NULL`, [orderId, userId, text.slice(0, 500)]);
        await connection.query("UPDATE `order` SET status = 'DISPUTED', confirmation_due_at = NULL WHERE id = ?", [orderId]);
        await connection.commit();
        return { order_id: Number(orderId), status: 'DISPUTED' };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function resolveDispute(orderId, decision, adminNote, database = db) {
    if (!['COMPLETE', 'REWORK'].includes(decision)) throw new DisputeError('Hướng xử lý không hợp lệ', 400);
    const connection = await database.getConnection();
    try {
        await connection.beginTransaction();
        const [[row]] = await connection.query(`SELECT o.*, d.id AS dispute_id
            FROM \`order\` o JOIN order_dispute d ON d.Orderid = o.id
            WHERE o.id = ? AND d.status = 'OPEN' FOR UPDATE`, [orderId]);
        if (!row || row.status !== 'DISPUTED') throw new DisputeError('Khiếu nại không còn mở', 404);
        const note = String(adminNote || '').trim().slice(0, 500) || null;
        if (decision === 'COMPLETE') {
            await connection.query("UPDATE `order` SET status = 'COMPLETED' WHERE id = ?", [orderId]);
            if (row.payment_method === 'ONLINE') await settlePartnerWallet(connection, row, `đơn #${row.id}`);
            await connection.query("UPDATE order_dispute SET status = 'RESOLVED_COMPLETE', admin_note = ?, resolved_at = NOW() WHERE id = ?", [note, row.dispute_id]);
            await connection.commit();
            return { order_id: Number(orderId), status: 'COMPLETED' };
        }
        await connection.query("UPDATE `order` SET status = 'IN_PROGRESS', confirmation_due_at = NULL WHERE id = ?", [orderId]);
        await connection.query("UPDATE order_dispute SET status = 'RESOLVED_REWORK', admin_note = ?, resolved_at = NOW() WHERE id = ?", [note, row.dispute_id]);
        await connection.commit();
        return { order_id: Number(orderId), status: 'IN_PROGRESS' };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { openDispute, resolveDispute, DisputeError };
