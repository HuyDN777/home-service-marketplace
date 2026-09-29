const db = require('../config/database');

const PARTNER_JOB_SHARE_RATE = Number(process.env.PARTNER_JOB_SHARE_RATE || 0.80);
const PARTNER_MIN_BALANCE = Number(process.env.PARTNER_MIN_BALANCE || -200000);

class EarningError extends Error {
    constructor(message, status = 409) {
        super(message);
        this.status = status;
    }
}

function calculatePartnerEarning(amount, commissionableAmount = amount) {
    const commissionable = Number(commissionableAmount ?? amount) || 0;
    return Math.round(commissionable * PARTNER_JOB_SHARE_RATE);
}

function calculatePlatformCommission(commissionableAmount) {
    return Math.round((Number(commissionableAmount) || 0) * (1 - PARTNER_JOB_SHARE_RATE));
}

function calculateWalletChange(paymentMethod, amount, commissionableAmount = amount) {
    return paymentMethod === 'CASH'
        ? -calculatePlatformCommission(commissionableAmount)
        : calculatePartnerEarning(amount, commissionableAmount);
}

async function settlePartnerWallet(connection, order, description = `Đơn #${order.id}`) {
    const [existingTransactions] = await connection.query(`SELECT wt.amount, e.partner_balance
        FROM partner_wallet_transaction wt
        JOIN employee e ON e.id = wt.Employeeid
        WHERE wt.Employeeid = ? AND wt.Orderid = ? AND wt.type = 'JOB_EARNING' LIMIT 1`,
    [order.Employeeid, order.id]);
    if (existingTransactions.length) {
        return {
            earning: Number(existingTransactions[0].amount),
            balance: Number(existingTransactions[0].partner_balance),
            alreadySettled: true
        };
    }
    const earning = calculatePartnerEarning(order.final_amount, order.commissionable_amount);
    if (order.payment_method === 'CASH') {
        const cashSubjectToSettlement = Number(order.commissionable_amount ?? order.final_amount) || 0;
        await connection.query('UPDATE employee SET partner_balance = partner_balance - ? WHERE id = ?', [cashSubjectToSettlement, order.Employeeid]);
        let [[partner]] = await connection.query('SELECT partner_balance FROM employee WHERE id = ? FOR UPDATE', [order.Employeeid]);
        await connection.query(`INSERT INTO partner_wallet_transaction
            (Employeeid, Orderid, type, amount, balance_after, description)
            VALUES (?, ?, 'CASH_COLLECTION', ?, ?, ?)`,
        [order.Employeeid, order.id, -cashSubjectToSettlement, partner.partner_balance, `Đối soát tiền mặt ${description}`]);

        await connection.query('UPDATE employee SET partner_balance = partner_balance + ? WHERE id = ?', [earning, order.Employeeid]);
        [[partner]] = await connection.query('SELECT partner_balance FROM employee WHERE id = ? FOR UPDATE', [order.Employeeid]);
        await connection.query(`INSERT INTO partner_wallet_transaction
            (Employeeid, Orderid, type, amount, balance_after, description)
            VALUES (?, ?, 'JOB_EARNING', ?, ?, ?)`,
        [order.Employeeid, order.id, earning, partner.partner_balance, `Thu nhập ${description}`]);
        if (Number(partner.partner_balance) <= PARTNER_MIN_BALANCE) {
            await connection.query('UPDATE employee SET accepting_jobs = 0 WHERE id = ?', [order.Employeeid]);
        }
        return { earning, balance: Number(partner.partner_balance) };
    }

    await connection.query('UPDATE employee SET partner_balance = partner_balance + ? WHERE id = ?', [earning, order.Employeeid]);
    const [[partner]] = await connection.query('SELECT partner_balance FROM employee WHERE id = ? FOR UPDATE', [order.Employeeid]);
    await connection.query(`INSERT INTO partner_wallet_transaction
        (Employeeid, Orderid, type, amount, balance_after, description)
        VALUES (?, ?, 'JOB_EARNING', ?, ?, ?)`,
    [order.Employeeid, order.id, earning, partner.partner_balance, `Thu nhập online ${description}`]);
    if (Number(partner.partner_balance) <= PARTNER_MIN_BALANCE) {
        await connection.query('UPDATE employee SET accepting_jobs = 0 WHERE id = ?', [order.Employeeid]);
    }
    return { earning, balance: Number(partner.partner_balance) };
}

async function completeOrderAndCreditPartner(orderId, userId, database = db) {
    const connection = await database.getConnection();
    try {
        await connection.beginTransaction();
        const [orders] = await connection.query(
            `SELECT id, Userid, Employeeid, status, final_amount, commissionable_amount,
                payment_method, payment_status, cash_collected_at
             FROM \`order\` WHERE id = ? FOR UPDATE`,
            [orderId]
        );
        const order = orders[0];
        if (!order || Number(order.Userid) !== Number(userId)) throw new EarningError('Không tìm thấy đơn hàng', 404);
        if (order.status !== 'WORK_DONE') throw new EarningError('Chỉ có thể xác nhận đơn đang chờ hoàn tất');
        if (!order.Employeeid) throw new EarningError('Đơn hàng chưa có CTV');

        await connection.query("UPDATE `order` SET status = 'COMPLETED' WHERE id = ?", [order.id]);
        const earning = order.payment_method === 'ONLINE'
            ? (await settlePartnerWallet(connection, order)).earning
            : calculatePartnerEarning(order.final_amount, order.commissionable_amount);
        await connection.commit();
        return { order_id: order.id, status: 'COMPLETED', partner_earning: earning };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function confirmCashCollection(orderId, employeeId, database = db) {
    const connection = await database.getConnection();
    try {
        await connection.beginTransaction();
        const [orders] = await connection.query(`SELECT id, Employeeid, status, final_amount,
                commissionable_amount, payment_method, payment_status, cash_collected_at
            FROM \`order\` WHERE id = ? FOR UPDATE`, [orderId]);
        const order = orders[0];
        if (!order || Number(order.Employeeid) !== Number(employeeId)) {
            throw new EarningError('Không tìm thấy đơn hàng', 404);
        }
        if (order.payment_method !== 'CASH') throw new EarningError('Đơn này không thanh toán bằng tiền mặt');
        if (!['WORK_DONE', 'COMPLETED'].includes(order.status)) {
            throw new EarningError('Chỉ xác nhận thu tiền sau khi hoàn tất công việc');
        }
        if (order.cash_collected_at) {
            await connection.commit();
            return { order_id: order.id, already_confirmed: true };
        }

        const wallet = await settlePartnerWallet(connection, order, `đơn #${order.id}`);
        await connection.query("UPDATE `order` SET payment_status = 'PAID', cash_collected_at = NOW() WHERE id = ?", [order.id]);
        await connection.query("UPDATE bill SET status = 'da thanh toan' WHERE Orderid = ?", [order.id]);
        await connection.commit();
        return { order_id: order.id, earning: wallet.earning, balance: wallet.balance };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { completeOrderAndCreditPartner, confirmCashCollection, settlePartnerWallet, calculatePartnerEarning, calculatePlatformCommission, calculateWalletChange, PARTNER_JOB_SHARE_RATE, EarningError };
