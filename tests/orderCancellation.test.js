const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cancelByCustomer } = require('../services/orderCancellation');

function database(order, balance = 0) {
    const state = { committed: false, rolledBack: false, debt: null, compensation: null };
    const connection = {
        async beginTransaction() {},
        async query(sql, params) {
            if (sql.includes('FROM `order` WHERE id = ? FOR UPDATE')) return [[order]];
            if (sql.startsWith('INSERT INTO customer_debt')) { state.debt = params[2]; return [{ affectedRows: 1 }]; }
            if (sql.startsWith('UPDATE employee SET partner_balance')) { balance += params[0]; return [{ affectedRows: 1 }]; }
            if (sql.startsWith('SELECT partner_balance')) return [[{ partner_balance: balance }]];
            if (sql.startsWith('INSERT INTO partner_wallet_transaction')) { state.compensation = params[2]; return [{ affectedRows: 1 }]; }
            return [{ affectedRows: 1 }];
        },
        async commit() { state.committed = true; },
        async rollback() { state.rolledBack = true; },
        release() {}
    };
    return { state, getConnection: async () => connection };
}

const now = new Date('2026-09-23T08:00:00Z');

test('customer cancels an unassigned order without a fee', async () => {
    const db = database({ id: 1, Userid: 2, Employeeid: null, status: 'PENDING', start_datetime: '2026-09-23T09:00:00Z', payment_method: 'CASH', payment_status: 'UNPAID', final_amount: 500000 });
    const result = await cancelByCustomer(1, 2, '', db, now);
    assert.equal(result.fee, 0);
    assert.equal(db.state.debt, null);
    assert.equal(db.state.committed, true);
});

test('late cash cancellation creates debt and credits 80 percent to partner', async () => {
    const db = database({ id: 1, Userid: 2, Employeeid: 7, status: 'ASSIGNED', start_datetime: '2026-09-23T09:00:00Z', payment_method: 'CASH', payment_status: 'UNPAID', final_amount: 500000 });
    const result = await cancelByCustomer(1, 2, 'Doi lich', db, now);
    assert.equal(result.fee, 100000);
    assert.equal(result.partner_compensation, 80000);
    assert.equal(result.platform_amount, 20000);
    assert.equal(db.state.debt, 100000);
    assert.equal(db.state.compensation, 80000);
});

test('online cancellation refunds the paid amount minus the late fee', async () => {
    const db = database({ id: 1, Userid: 2, Employeeid: 7, status: 'ASSIGNED', start_datetime: '2026-09-23T09:00:00Z', payment_method: 'ONLINE', payment_status: 'PAID', final_amount: 500000 });
    const result = await cancelByCustomer(1, 2, 'Doi lich', db, now);
    assert.equal(result.payment_status, 'PENDING_REFUND');
    assert.equal(result.fee, 100000);
    assert.equal(result.refund_amount, 400000);
    assert.equal(db.state.debt, null);
});

test('online cancellation before the late window refunds the full amount', async () => {
    const db = database({ id: 1, Userid: 2, Employeeid: 7, status: 'ASSIGNED', start_datetime: '2026-09-23T12:00:01Z', payment_method: 'ONLINE', payment_status: 'PAID', final_amount: 500000 });
    const result = await cancelByCustomer(1, 2, '', db, now);
    assert.equal(result.fee, 0);
    assert.equal(result.refund_amount, 500000);
});

test('customer cannot cancel work that has started', async () => {
    const db = database({ id: 1, Userid: 2, Employeeid: 7, status: 'IN_PROGRESS', start_datetime: '2026-09-23T07:00:00Z', payment_method: 'CASH', payment_status: 'UNPAID', final_amount: 500000 });
    await assert.rejects(cancelByCustomer(1, 2, '', db, now), { status: 409 });
    assert.equal(db.state.rolledBack, true);
});
