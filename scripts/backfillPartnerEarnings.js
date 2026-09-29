require('dotenv').config();
const db = require('../config/database');
const { calculatePartnerEarning } = require('../services/partnerEarnings');

async function run() {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [orders] = await connection.query(`
            SELECT o.id, o.Employeeid, o.final_amount
            FROM \`order\` o
            WHERE o.status = 'COMPLETED' AND o.Employeeid IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM partner_wallet_transaction wt
                  WHERE wt.Orderid = o.id AND wt.Employeeid = o.Employeeid AND wt.type = 'JOB_EARNING'
              )
            ORDER BY o.Employeeid, o.id
            FOR UPDATE
        `);
        for (const order of orders) {
            const amount = calculatePartnerEarning(order.final_amount);
            await connection.query('UPDATE employee SET partner_balance = partner_balance + ? WHERE id = ?', [amount, order.Employeeid]);
            const [[employee]] = await connection.query('SELECT partner_balance FROM employee WHERE id = ?', [order.Employeeid]);
            await connection.query(
                `INSERT INTO partner_wallet_transaction
                    (Employeeid, Orderid, type, amount, balance_after, description)
                 VALUES (?, ?, 'JOB_EARNING', ?, ?, ?)`,
                [order.Employeeid, order.id, amount, employee.partner_balance, `Thu nhập đơn #${order.id}`]
            );
        }
        await connection.commit();
        console.log(`Backfilled ${orders.length} completed orders.`);
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
        await db.end();
    }
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
