const crypto = require('crypto');
const { RefundTransactionType, dateFormat } = require('vnpay');
const db = require('../config/database');
const { createVnpay } = require('../config/vnpay');

class RefundError extends Error {
    constructor(message, status = 409) {
        super(message);
        this.status = status;
    }
}

function createRequestId(orderId) {
    return `RF${orderId}${Date.now()}${crypto.randomBytes(3).toString('hex')}`.slice(0, 100);
}

function normalizeIpAddress(value) {
    if (!value || value === '::1') return '127.0.0.1';
    return String(value).replace(/^::ffff:/, '').split(',')[0].trim();
}

function shouldMockRefundCompletion() {
    return process.env.NODE_ENV !== 'production' && process.env.VNP_REFUND_MOCK_COMPLETED === 'true';
}

async function markRefundCompleted(orderId, database = db) {
    await database.query(
        `UPDATE refund_transaction
         SET status = 'COMPLETED', provider_transaction_status = '06', completed_at = NOW()
         WHERE Orderid = ?`,
        [orderId]
    );
    await database.query("UPDATE `order` SET payment_status = 'REFUNDED' WHERE id = ?", [orderId]);
}

async function requestOrderRefund(orderId, ipAddress = '127.0.0.1', database = db) {
    const connection = await database.getConnection();
    let refund;

    try {
        await connection.beginTransaction();
        const [rows] = await connection.query(
            `SELECT o.id, o.payment_method, o.payment_status, oc.fee_amount,
                    pt.id AS payment_transaction_id, pt.txn_ref, pt.provider_transaction_no,
                    pt.transaction_date, pt.amount AS paid_amount, rt.id AS refund_id,
                    rt.request_id, rt.status AS refund_status
             FROM \`order\` o
             JOIN order_cancellation oc ON oc.Orderid = o.id
             JOIN payment_transaction pt ON pt.Orderid = o.id AND pt.status = 'PAID'
             LEFT JOIN refund_transaction rt ON rt.Orderid = o.id
             WHERE o.id = ? FOR UPDATE`,
            [orderId]
        );
        const order = rows[0];
        if (!order) throw new RefundError('Không tìm thấy giao dịch VNPAY của đơn hàng');
        if (order.payment_method !== 'ONLINE') throw new RefundError('Đơn tiền mặt không hoàn qua VNPAY');
        if (!['PENDING_REFUND', 'REFUND_FAILED', 'PAID'].includes(order.payment_status)) {
            throw new RefundError('Trạng thái thanh toán không cho phép hoàn tiền');
        }
        if (['SUBMITTED', 'COMPLETED'].includes(order.refund_status)) {
            await connection.commit();
            return { already_requested: true, status: order.refund_status };
        }

        const paidAmount = Number(order.paid_amount);
        const refundAmount = Math.max(0, paidAmount - Number(order.fee_amount || 0));
        if (refundAmount <= 0 || refundAmount > paidAmount) throw new RefundError('Số tiền hoàn không hợp lệ');

        const requestId = order.refund_status === 'FAILED' || !order.request_id
            ? createRequestId(order.id)
            : order.request_id;
        if (order.refund_id) {
            await connection.query(
                `UPDATE refund_transaction SET request_id = ?, status = 'CREATED', amount = ?,
                    refund_type = ?, provider_response_code = NULL, provider_transaction_status = NULL,
                    provider_message = NULL, raw_response = NULL, requested_at = NULL
                 WHERE id = ?`,
                [requestId, refundAmount, refundAmount === paidAmount ? 'FULL' : 'PARTIAL', order.refund_id]
            );
        } else {
            await connection.query(
                `INSERT INTO refund_transaction
                    (Orderid, payment_transaction_id, request_id, refund_type, amount)
                 VALUES (?, ?, ?, ?, ?)`,
                [order.id, order.payment_transaction_id, requestId,
                    refundAmount === paidAmount ? 'FULL' : 'PARTIAL', refundAmount]
            );
        }
        await connection.commit();
        refund = { ...order, request_id: requestId, refund_amount: refundAmount };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    try {
        const response = await createVnpay().refund({
            vnp_RequestId: refund.request_id,
            vnp_TransactionType: refund.refund_amount === Number(refund.paid_amount)
                ? RefundTransactionType.FULL_REFUND
                : RefundTransactionType.PARTIAL_REFUND,
            vnp_TxnRef: refund.txn_ref,
            vnp_TransactionNo: refund.provider_transaction_no || undefined,
            vnp_Amount: refund.refund_amount,
            vnp_TransactionDate: Number(refund.transaction_date),
            vnp_CreateBy: 'houseservice',
            vnp_CreateDate: dateFormat(new Date()),
            vnp_IpAddr: normalizeIpAddress(ipAddress),
            vnp_OrderInfo: `Hoantien${refund.id}`
        });
        const accepted = response.isVerified && response.isSuccess;
        await database.query(
            `UPDATE refund_transaction SET status = ?, provider_response_code = ?,
                provider_transaction_status = ?, provider_message = ?, raw_response = ?, requested_at = NOW()
             WHERE request_id = ?`,
            [accepted ? 'SUBMITTED' : 'FAILED', String(response.vnp_ResponseCode || ''),
                String(response.vnp_TransactionStatus || ''), response.message || response.vnp_Message || null,
                JSON.stringify(response), refund.request_id]
        );
        if (!accepted) {
            await database.query("UPDATE `order` SET payment_status = 'REFUND_FAILED' WHERE id = ?", [refund.id]);
            throw new RefundError(response.message || 'VNPAY từ chối yêu cầu hoàn tiền', 502);
        }
        if (shouldMockRefundCompletion()) {
            await markRefundCompleted(refund.id, database);
            return { request_id: refund.request_id, amount: refund.refund_amount, status: 'COMPLETED', mocked: true };
        }
        await database.query("UPDATE `order` SET payment_status = 'PENDING_REFUND' WHERE id = ?", [refund.id]);
        return { request_id: refund.request_id, amount: refund.refund_amount, status: 'SUBMITTED' };
    } catch (error) {
        await database.query(
            `UPDATE refund_transaction SET status = 'FAILED', provider_message = ? WHERE request_id = ?`,
            [String(error.message || error).slice(0, 255), refund.request_id]
        );
        await database.query("UPDATE `order` SET payment_status = 'REFUND_FAILED' WHERE id = ?", [refund.id]);
        throw error;
    }
}

async function queryOrderRefund(orderId, ipAddress = '127.0.0.1', database = db) {
    const [rows] = await database.query(
        `SELECT o.id, pt.txn_ref, pt.provider_transaction_no, pt.transaction_date,
                rt.status AS refund_status
         FROM \`order\` o
         JOIN payment_transaction pt ON pt.Orderid = o.id
         JOIN refund_transaction rt ON rt.Orderid = o.id
         WHERE o.id = ?`,
        [orderId]
    );
    const refund = rows[0];
    if (!refund) throw new RefundError('Không tìm thấy yêu cầu hoàn tiền', 404);
    if (refund.refund_status === 'COMPLETED') return { status: 'COMPLETED' };
    if (shouldMockRefundCompletion()) {
        await markRefundCompleted(orderId, database);
        return { status: 'COMPLETED', mocked: true };
    }

    const response = await createVnpay().queryDr({
        vnp_RequestId: `Q${orderId}${Date.now()}`.slice(0, 32),
        vnp_TxnRef: refund.txn_ref,
        vnp_TransactionNo: Number(refund.provider_transaction_no),
        vnp_TransactionDate: Number(refund.transaction_date),
        vnp_CreateDate: dateFormat(new Date()),
        vnp_IpAddr: normalizeIpAddress(ipAddress),
        vnp_OrderInfo: `Kiemtra${orderId}`
    });
    if (String(response.vnp_ResponseCode) === '94') {
        return { status: 'SUBMITTED', duplicate_query: true };
    }
    if (!response.isVerified || !response.isSuccess) {
        throw new RefundError(response.message || 'Không truy vấn được trạng thái hoàn tiền', 502);
    }

    const transactionStatus = String(response.vnp_TransactionStatus || '');
    const transactionType = String(response.vnp_TransactionType || '');
    if (['02', '03'].includes(transactionType) && transactionStatus === '06') {
        await markRefundCompleted(orderId, database);
        return { status: 'COMPLETED' };
    }
    if (transactionStatus === '09') {
        await database.query("UPDATE refund_transaction SET status = 'FAILED', provider_transaction_status = '09' WHERE Orderid = ?", [orderId]);
        await database.query("UPDATE `order` SET payment_status = 'REFUND_FAILED' WHERE id = ?", [orderId]);
        return { status: 'FAILED' };
    }
    return { status: 'SUBMITTED', transaction_status: transactionStatus };
}

module.exports = { requestOrderRefund, queryOrderRefund, RefundError, normalizeIpAddress, shouldMockRefundCompletion };
