const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reserveTempOrderTxnRef, completeBookingOnlinePayment } = require('../services/onlineBookingPayment');

test('reopening a payment keeps its original transaction reference', async () => {
    const calls = [];
    const database = {
        async query(sql, params) {
            calls.push({ sql, params });
            if (sql.startsWith('SELECT txn_ref')) return [[{ txn_ref: 'original-ref' }]];
            return [{ affectedRows: 1 }];
        }
    };
    const txnRef = await reserveTempOrderTxnRef(7, 'replacement-ref', database);
    assert.equal(txnRef, 'original-ref');
    assert.match(calls[0].sql, /COALESCE\(txn_ref/);
});

test('failed online order creation rolls back and preserves the temporary order', async () => {
    const calls = [];
    let rolledBack = false;
    const connection = {
        async beginTransaction() {},
        async commit() {},
        async rollback() { rolledBack = true; },
        release() {},
        async query(sql) {
            calls.push(sql);
            if (sql.includes('FROM payment_transaction')) return [[]];
            if (sql.includes("FROM temp_order")) return [[{
                id: 9,
                txn_ref: 'booking-9',
                user_id: 1,
                service_id: 23,
                booking_date: '2026-09-28',
                implementing_date: '2026-09-29',
                start_datetime: '2026-09-29 10:00:00',
                end_datetime: '2026-09-29 12:00:00',
                promotion_id: null,
                final_price: 200000,
                address: 'Hanoi',
                note: null
            }]];
            if (sql.includes('INSERT INTO `order`')) return [{ insertId: 44 }];
            if (sql.includes('INSERT INTO bill')) throw new Error('bill insert failed');
            return [{ affectedRows: 1 }];
        }
    };
    const database = { async getConnection() { return connection; } };

    await assert.rejects(() => completeBookingOnlinePayment(9, {
        vnp_TxnRef: 'booking-9',
        vnp_Amount: 200000,
        transactionDate: '20260928120000'
    }, database), /bill insert failed/);

    assert.equal(rolledBack, true);
    assert.equal(calls.some(sql => sql.includes('DELETE FROM temp_order')), false);
});
