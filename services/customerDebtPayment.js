const db = require('../config/database');

class DebtPaymentError extends Error {
    constructor(message, status = 409) {
        super(message);
        this.status = status;
    }
}

async function getUnpaidDebt(userId, database = db) {
    const [[row]] = await database.query(
        "SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count FROM customer_debt WHERE Userid = ? AND status = 'UNPAID'",
        [userId]
    );
    return { amount: Number(row.amount || 0), count: Number(row.count || 0) };
}

async function createDebtPayment(userId, database = db) {
    const connection = await database.getConnection();
    try {
        await connection.beginTransaction();
        const [users] = await connection.query('SELECT id FROM user WHERE id = ? FOR UPDATE', [userId]);
        if (!users.length) throw new DebtPaymentError('Không tìm thấy tài khoản', 404);
        await connection.query("UPDATE customer_debt_payment SET status = 'EXPIRED' WHERE Userid = ? AND status = 'PENDING' AND expires_at <= NOW()", [userId]);
        const [existing] = await connection.query("SELECT id, amount, txn_ref FROM customer_debt_payment WHERE Userid = ? AND status = 'PENDING' AND expires_at > NOW() ORDER BY id DESC LIMIT 1 FOR UPDATE", [userId]);
        if (existing.length) {
            await connection.commit();
            return existing[0];
        }
        const [debts] = await connection.query("SELECT id, amount FROM customer_debt WHERE Userid = ? AND status = 'UNPAID' FOR UPDATE", [userId]);
        if (!debts.length) throw new DebtPaymentError('Bạn không còn phí hủy cần thanh toán', 400);
        const amount = debts.reduce((sum, debt) => sum + Number(debt.amount), 0);
        const [result] = await connection.query("INSERT INTO customer_debt_payment (Userid, amount, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))", [userId, amount]);
        for (const debt of debts) {
            await connection.query("INSERT INTO customer_debt_payment_item (payment_id, debt_id, amount) VALUES (?, ?, ?)", [result.insertId, debt.id, debt.amount]);
        }
        await connection.commit();
        return { id: result.insertId, amount };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function setDebtPaymentTxnRef(paymentId, txnRef, database = db) {
    const [result] = await database.query(
        "UPDATE customer_debt_payment SET txn_ref = COALESCE(txn_ref, ?) WHERE id = ? AND status = 'PENDING'",
        [txnRef, paymentId]
    );
    if (!result.affectedRows) throw new DebtPaymentError('Khoản thanh toán không còn hiệu lực', 409);
    const [[payment]] = await database.query('SELECT txn_ref FROM customer_debt_payment WHERE id = ?', [paymentId]);
    return payment.txn_ref;
}

async function completeDebtPayment(paymentId, verification, database = db) {
    const connection = await database.getConnection();
    try {
        await connection.beginTransaction();
        const [payments] = await connection.query("SELECT id, amount, status, txn_ref FROM customer_debt_payment WHERE id = ? FOR UPDATE", [paymentId]);
        const payment = payments[0];
        if (!payment) throw new DebtPaymentError('Không tìm thấy khoản thanh toán', 404);
        if (payment.status === 'PAID') {
            await connection.commit();
            return { alreadyPaid: true, amount: Number(payment.amount) };
        }
        if (payment.txn_ref && String(verification.vnp_TxnRef) !== String(payment.txn_ref)) {
            throw new DebtPaymentError('Mã giao dịch thanh toán không khớp', 400);
        }
        if (Number(verification.vnp_Amount) !== Number(payment.amount)) throw new DebtPaymentError('Số tiền thanh toán không khớp', 400);
        const [items] = await connection.query('SELECT debt_id FROM customer_debt_payment_item WHERE payment_id = ?', [payment.id]);
        const debtIds = items.map(item => item.debt_id);
        if (!debtIds.length) throw new DebtPaymentError('Khoản thanh toán không có chi tiết nợ');
        await connection.query("UPDATE customer_debt SET status = 'PAID', paid_at = NOW() WHERE id IN (?) AND status = 'UNPAID'", [debtIds]);
        await connection.query("UPDATE order_cancellation oc JOIN customer_debt d ON d.Orderid = oc.Orderid SET oc.fee_status = 'COLLECTED' WHERE d.id IN (?)", [debtIds]);
        await connection.query(`UPDATE customer_debt_payment SET status = 'PAID', txn_ref = ?, provider_transaction_no = ?, bank_code = ?, raw_response = ?, paid_at = NOW() WHERE id = ?`,
            [verification.vnp_TxnRef, verification.vnp_TransactionNo || null, verification.vnp_BankCode || null, JSON.stringify(verification), payment.id]);
        await connection.commit();
        return { amount: Number(payment.amount) };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { getUnpaidDebt, createDebtPayment, setDebtPaymentTxnRef, completeDebtPayment, DebtPaymentError };
