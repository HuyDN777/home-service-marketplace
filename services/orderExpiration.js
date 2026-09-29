const db = require('../config/database');
const { ACCEPTANCE_CUTOFF_MINUTES } = require('./orderPolicy');
const { publish } = require('./realtime');
const { requestOrderRefund } = require('./vnpayRefund');
const { completeOrderAndCreditPartner } = require('./partnerEarnings');

async function autoCompleteOrders(database = db, now = new Date(), completer = completeOrderAndCreditPartner) {
    const [orders] = await database.query(`SELECT o.id, o.Userid FROM \`order\` o
        WHERE o.status = 'WORK_DONE' AND o.confirmation_due_at IS NOT NULL AND o.confirmation_due_at <= ?
          AND NOT EXISTS (SELECT 1 FROM order_dispute d WHERE d.Orderid = o.id AND d.status = 'OPEN')
          AND NOT EXISTS (SELECT 1 FROM service_quote q WHERE q.Orderid = o.id AND q.status = 'PENDING')`, [now]);
    let completed = 0;
    for (const order of orders) {
        try {
            await completer(order.id, order.Userid, database);
            completed += 1;
        } catch (error) {
            console.error(`Không thể tự hoàn tất đơn #${order.id}:`, error.message);
        }
    }
    return completed;
}

async function expireUnmatchedOrders(database = db, now = new Date(), refundRequester = requestOrderRefund) {
    const cleanupBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    await database.query('DELETE FROM temp_order WHERE expires_at IS NOT NULL AND expires_at <= ?', [cleanupBefore]);
    const deadline = new Date(now.getTime() + ACCEPTANCE_CUTOFF_MINUTES * 60000);
    const [orders] = await database.query(
        `SELECT id, payment_method, payment_status
         FROM \`order\`
         WHERE status IN ('PENDING', 'OFFERED')
           AND start_datetime <= ?`,
        [deadline]
    );
    let expired = 0;

    for (const order of orders) {
        const [result] = await database.query(
            `UPDATE \`order\`
             SET status = 'EXPIRED', Employeeid = NULL, offer_expires_at = NULL,
                 cancelled_by = 'SYSTEM',
                 cancellation_reason = 'Không tìm được CTV trước hạn nhận việc',
                 cancelled_at = ?,
                 payment_status = CASE
                     WHEN payment_method = 'ONLINE' AND payment_status = 'PAID' THEN 'PENDING_REFUND'
                     ELSE payment_status
                 END
             WHERE id = ? AND status IN ('PENDING', 'OFFERED')`,
            [now, order.id]
        );
        if (!result.affectedRows) continue;
        expired += 1;

        await database.query(
            `INSERT INTO order_cancellation
                (Orderid, cancelled_by, reason, fee_amount, partner_compensation, platform_amount, fee_status)
             VALUES (?, 'SYSTEM', 'Không tìm được CTV trước hạn nhận việc', 0, 0, 0, 'NOT_APPLICABLE')
             ON DUPLICATE KEY UPDATE cancelled_by = VALUES(cancelled_by), reason = VALUES(reason)`,
            [order.id]
        );

        if (order.payment_method === 'ONLINE' && order.payment_status === 'PAID') {
            try {
                await refundRequester(order.id, '127.0.0.1', database);
            } catch (error) {
                console.error(`Không thể hoàn tiền đơn hết hạn #${order.id}:`, error.message);
            }
        }
    }
    return expired;
}

function startExpirationWorker({ database = db, intervalMs = 60000, logger = console } = {}) {
    const run = async () => {
        try {
            const expired = await expireUnmatchedOrders(database);
            const completed = await autoCompleteOrders(database);
            if (expired) {
                logger.log(`Đã hết hạn ${expired} đơn không có CTV nhận.`);
                publish('orders_changed', { expired_count: expired });
            }
            if (completed) logger.log(`Đã tự động hoàn tất ${completed} đơn quá hạn xác nhận.`);
        } catch (error) {
            logger.error('Không thể quét đơn hết hạn:', error.message);
        }
    };
    run();
    const timer = setInterval(run, intervalMs);
    timer.unref?.();
    return timer;
}

module.exports = { expireUnmatchedOrders, autoCompleteOrders, startExpirationWorker };
