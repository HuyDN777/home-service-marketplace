const db = require('../config/database');
const { ACCEPTANCE_CUTOFF_MINUTES, canClaimOrder } = require('./orderPolicy');
const PARTNER_MIN_BALANCE = Number(process.env.PARTNER_MIN_BALANCE || -200000);

class MarketplaceError extends Error {
    constructor(message, status = 409) {
        super(message);
        this.status = status;
    }
}

async function listAvailableJobs(partnerId, database = db) {
    const [partners] = await database.query(
        'SELECT Serviceid, active, accepting_jobs, partner_balance FROM employee WHERE id = ?', [partnerId]
    );
    const partner = partners[0];
    if (!partner || !partner.active) throw new MarketplaceError('Tai khoan CTV chua duoc duyet', 403);
    if (Number(partner.accepting_jobs) === 0) throw new MarketplaceError('Ban dang tat che do nhan viec', 403);
    if (Number(partner.partner_balance) <= PARTNER_MIN_BALANCE) throw new MarketplaceError('Số dư ví đã chạm hạn mức. Vui lòng nạp thêm để nhận việc', 403);

    const [orders] = await database.query(`
        SELECT o.id, o.start_datetime, o.end_datetime, o.address, o.final_amount, o.commissionable_amount, s.name AS service_name
        FROM \`order\` o
        JOIN service s ON s.id = o.Serviceid
        WHERE o.status = 'PENDING' AND o.Employeeid IS NULL
          AND o.Serviceid = ? AND o.start_datetime > DATE_ADD(NOW(), INTERVAL ${ACCEPTANCE_CUTOFF_MINUTES} MINUTE)
          AND NOT EXISTS (SELECT 1 FROM order_rejection r WHERE r.Orderid = o.id AND r.Employeeid = ?)
          AND NOT EXISTS (
              SELECT 1 FROM \`order\` busy
              WHERE busy.Employeeid = ?
                AND busy.status IN ('ASSIGNED', 'IN_PROGRESS')
                AND busy.start_datetime < o.end_datetime
                AND busy.end_datetime > o.start_datetime
          )
          AND NOT EXISTS (
              SELECT 1 FROM temp_order reserved
              WHERE reserved.payment_context = 'REPAIR_QUOTE'
                AND reserved.employee_id = ? AND reserved.expires_at > NOW()
                AND reserved.start_datetime < o.end_datetime
                AND reserved.end_datetime > o.start_datetime
          )
        ORDER BY o.start_datetime ASC, o.id ASC
        LIMIT 50
    `, [partner.Serviceid, partnerId, partnerId, partnerId]);
    return orders;
}

async function claimJob(orderId, partnerId, database = db) {
    const connection = await database.getConnection();
    try {
        await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        await connection.beginTransaction();

        const [orders] = await connection.query(
            'SELECT id, Serviceid, Employeeid, status, start_datetime, end_datetime FROM `order` WHERE id = ? FOR UPDATE',
            [orderId]
        );
        const order = orders[0];
        if (!order) throw new MarketplaceError('Khong tim thay cong viec', 404);
        if (order.status !== 'PENDING' || order.Employeeid !== null) {
            throw new MarketplaceError('Cong viec da duoc nguoi khac nhan');
        }
        if (!canClaimOrder(order.start_datetime)) {
            throw new MarketplaceError('Da qua han nhan viec truoc gio lam 30 phut');
        }

        const [partners] = await connection.query(
            'SELECT Serviceid, active, accepting_jobs, partner_balance FROM employee WHERE id = ? FOR UPDATE', [partnerId]
        );
        const partner = partners[0];
        if (!partner || !partner.active) throw new MarketplaceError('Tai khoan CTV chua duoc duyet', 403);
        if (Number(partner.accepting_jobs) === 0) throw new MarketplaceError('Ban dang tat che do nhan viec', 403);
        if (Number(partner.partner_balance) <= PARTNER_MIN_BALANCE) throw new MarketplaceError('Số dư ví đã chạm hạn mức. Vui lòng nạp thêm để nhận việc', 403);
        if (partner.Serviceid !== order.Serviceid) throw new MarketplaceError('Dich vu khong phu hop', 403);

        const [conflicts] = await connection.query(`
            SELECT id FROM \`order\`
            WHERE Employeeid = ? AND status IN ('ASSIGNED', 'IN_PROGRESS')
              AND start_datetime < ? AND end_datetime > ?
            UNION ALL
            SELECT id FROM temp_order
            WHERE payment_context = 'REPAIR_QUOTE' AND employee_id = ? AND expires_at > NOW()
              AND start_datetime < ? AND end_datetime > ? LIMIT 1
        `, [partnerId, order.end_datetime, order.start_datetime,
            partnerId, order.end_datetime, order.start_datetime]);
        if (conflicts.length) throw new MarketplaceError('Ca lam trung voi lich cua ban');

        await connection.query(
            "UPDATE `order` SET Employeeid = ?, status = 'ASSIGNED', offer_expires_at = NULL WHERE id = ?",
            [partnerId, orderId]
        );
        await connection.query(`INSERT IGNORE INTO partner_job_decision (Orderid, Employeeid, decision)
            VALUES (?, ?, 'ACCEPTED')`, [orderId, partnerId]);
        await connection.commit();
        return { id: order.id, status: 'ASSIGNED' };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function rejectJob(orderId, partnerId, reason, database = db) {
    const [orders] = await database.query(`SELECT o.id FROM \`order\` o JOIN employee e ON e.id = ?
        WHERE o.id = ? AND o.status = 'PENDING' AND o.Employeeid IS NULL AND o.Serviceid = e.Serviceid`, [partnerId, orderId]);
    if (!orders.length) throw new MarketplaceError('Công việc không còn khả dụng', 404);
    await database.query(`INSERT INTO order_rejection (Orderid, Employeeid, action, reason)
        VALUES (?, ?, 'DECLINED', ?) ON DUPLICATE KEY UPDATE reason = VALUES(reason), rejected_at = NOW()`,
    [orderId, partnerId, String(reason || '').trim().slice(0, 255) || null]);
    await database.query(`INSERT IGNORE INTO partner_job_decision (Orderid, Employeeid, decision)
        VALUES (?, ?, 'DECLINED')`, [orderId, partnerId]);
    return { id: Number(orderId), rejected: true };
}

async function cancelClaimedJob(orderId, partnerId, reason, database = db) {
    const connection = await database.getConnection();
    try {
        await connection.beginTransaction();
        const [[order]] = await connection.query(`SELECT id, status, start_datetime FROM \`order\`
            WHERE id = ? AND Employeeid = ? FOR UPDATE`, [orderId, partnerId]);
        if (!order || order.status !== 'ASSIGNED') throw new MarketplaceError('Chỉ có thể hủy ca chưa bắt đầu');
        if (!canClaimOrder(order.start_datetime)) throw new MarketplaceError('Không thể hủy ca khi còn dưới 30 phút');
        await connection.query(`INSERT INTO order_rejection (Orderid, Employeeid, action, reason)
            VALUES (?, ?, 'CANCELLED', ?) ON DUPLICATE KEY UPDATE action = 'CANCELLED', reason = VALUES(reason), rejected_at = NOW()`,
        [orderId, partnerId, String(reason || '').trim().slice(0, 255) || null]);
        await connection.query(`INSERT IGNORE INTO partner_job_decision (Orderid, Employeeid, decision)
            VALUES (?, ?, 'CANCELLED')`, [orderId, partnerId]);
        await connection.query("UPDATE `order` SET Employeeid = NULL, status = 'PENDING' WHERE id = ?", [orderId]);
        await connection.commit();
        return { id: Number(orderId), status: 'PENDING' };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function getRejectionStats(partnerId, database = db) {
    const [[row]] = await database.query(`SELECT
        SUM(decision = 'DECLINED' AND created_at >= CURDATE()) AS today,
        SUM(decision = 'DECLINED' AND created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS this_month,
        SUM(decision = 'ACCEPTED' AND created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS accepted_this_month,
        SUM(decision = 'CANCELLED' AND created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS cancelled_this_month,
        SUM(decision = 'DECLINED') AS total
        FROM partner_job_decision WHERE Employeeid = ?`, [partnerId]);
    const declined = Number(row.this_month || 0);
    const accepted = Number(row.accepted_this_month || 0);
    return {
        today: Number(row.today || 0),
        this_month: declined,
        total: Number(row.total || 0),
        accepted_this_month: accepted,
        cancelled_this_month: Number(row.cancelled_this_month || 0),
        rejection_rate_month: declined + accepted ? Math.round(declined * 10000 / (declined + accepted)) / 100 : 0
    };
}

module.exports = { listAvailableJobs, claimJob, rejectJob, cancelClaimedJob, getRejectionStats, MarketplaceError, PARTNER_MIN_BALANCE };
