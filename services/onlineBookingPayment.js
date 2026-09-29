const db = require('../config/database');

class OnlinePaymentError extends Error {
    constructor(message, status = 409) {
        super(message);
        this.status = status;
    }
}

async function reserveTempOrderTxnRef(tempOrderId, proposedTxnRef, database = db) {
    await database.query(
        'UPDATE temp_order SET txn_ref = COALESCE(txn_ref, ?) WHERE id = ?',
        [proposedTxnRef, tempOrderId]
    );
    const [[row]] = await database.query('SELECT txn_ref FROM temp_order WHERE id = ?', [tempOrderId]);
    if (!row) throw new OnlinePaymentError('Không tìm thấy yêu cầu thanh toán', 404);
    return row.txn_ref;
}

async function findCompletedOrder(connection, txnRef) {
    const [rows] = await connection.query(
        "SELECT Orderid FROM payment_transaction WHERE provider = 'VNPAY' AND txn_ref = ? LIMIT 1 FOR UPDATE",
        [txnRef]
    );
    return rows[0]?.Orderid || null;
}

async function completeBookingOnlinePayment(tempOrderId, verification, database = db) {
    const connection = await database.getConnection();
    try {
        await connection.beginTransaction();
        const existingOrderId = await findCompletedOrder(connection, verification.vnp_TxnRef);
        if (existingOrderId) {
            await connection.commit();
            return { orderId: existingOrderId, alreadyPaid: true };
        }

        const [rows] = await connection.query(
            "SELECT * FROM temp_order WHERE id = ? AND payment_context = 'BOOKING' FOR UPDATE",
            [tempOrderId]
        );
        const temp = rows[0];
        if (!temp) {
            const completedOrderId = await findCompletedOrder(connection, verification.vnp_TxnRef);
            if (completedOrderId) {
                await connection.commit();
                return { orderId: completedOrderId, alreadyPaid: true };
            }
            throw new OnlinePaymentError('Không tìm thấy đơn hàng đang thanh toán', 404);
        }
        if (temp.txn_ref && String(temp.txn_ref) !== String(verification.vnp_TxnRef)) {
            throw new OnlinePaymentError('Mã giao dịch thanh toán không khớp', 400);
        }
        if (Number(verification.vnp_Amount) !== Number(temp.final_price)) {
            throw new OnlinePaymentError('Số tiền thanh toán không khớp', 400);
        }

        const [result] = await connection.query(`INSERT INTO \`order\`
            (Userid, Serviceid, Employeeid, booking_date, implementing_date, start_datetime,
             end_datetime, Promotionid, status, payment_status, payment_method, final_amount, address, note)
            VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'PENDING', 'PAID', 'ONLINE', ?, ?, ?)`,
        [temp.user_id, temp.service_id, temp.booking_date, temp.implementing_date,
            temp.start_datetime, temp.end_datetime, temp.promotion_id, temp.final_price,
            temp.address, temp.note]);
        await connection.query(
            "INSERT INTO bill (amount, status, date, Orderid) VALUES (?, 'da thanh toan', NOW(), ?)",
            [temp.final_price, result.insertId]
        );
        await connection.query(`INSERT INTO payment_transaction
            (Orderid, txn_ref, provider_transaction_no, transaction_date, amount, bank_code, status, raw_response)
            VALUES (?, ?, ?, ?, ?, ?, 'PAID', ?)`,
        [result.insertId, verification.vnp_TxnRef, verification.vnp_TransactionNo || null,
            verification.transactionDate, temp.final_price, verification.vnp_BankCode || null,
            JSON.stringify(verification)]);
        await connection.query('DELETE FROM temp_order WHERE id = ?', [tempOrderId]);
        await connection.commit();
        return { orderId: result.insertId, alreadyPaid: false };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { reserveTempOrderTxnRef, completeBookingOnlinePayment, OnlinePaymentError };
