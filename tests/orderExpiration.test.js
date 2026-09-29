const { test } = require('node:test');
const assert = require('node:assert/strict');
const { canCreateBooking, canClaimOrder, requiresOnlinePayment, canStartOrder } = require('../services/orderPolicy');
const { expireUnmatchedOrders, autoCompleteOrders } = require('../services/orderExpiration');

const now = new Date('2026-09-23T08:00:00.000Z');

test('booking and matching deadlines use the shared policy', () => {
    assert.equal(canCreateBooking(new Date('2026-09-23T08:59:59.000Z'), now), false);
    assert.equal(canCreateBooking(new Date('2026-09-23T09:00:00.000Z'), now), true);
    assert.equal(canClaimOrder(new Date('2026-09-23T08:30:00.000Z'), now), false);
    assert.equal(canClaimOrder(new Date('2026-09-23T08:30:01.000Z'), now), true);
    assert.equal(requiresOnlinePayment(new Date('2026-09-23T10:00:00.000Z'), now), true);
    assert.equal(requiresOnlinePayment(new Date('2026-09-23T10:00:01.000Z'), now), false);
    assert.equal(canStartOrder(new Date('2026-09-23T08:15:00.000Z'), now), true);
    assert.equal(canStartOrder(new Date('2026-09-23T08:15:01.000Z'), now), false);
});

test('expiration scan uses now plus the 30 minute cutoff', async () => {
    const calls = [];
    const database = {
        async query(sql, params) {
            calls.push({ sql, params });
            if (sql.includes('SELECT id, payment_method')) return [[
                { id: 1, payment_method: 'CASH', payment_status: 'UNPAID' },
                { id: 2, payment_method: 'ONLINE', payment_status: 'PAID' }
            ]];
            if (sql.includes('UPDATE `order`')) return [{ affectedRows: 1 }];
            return [{ affectedRows: 1 }];
        }
    };
    const refunds = [];
    const refundRequester = async orderId => refunds.push(orderId);
    assert.equal(await expireUnmatchedOrders(database, now, refundRequester), 2);
    const cleanupQuery = calls.find(call => call.sql.includes('DELETE FROM temp_order'));
    assert.equal(cleanupQuery.params[0].toISOString(), '2026-09-22T08:00:00.000Z');
    const candidateQuery = calls.find(call => call.sql.includes('SELECT id, payment_method'));
    assert.equal(candidateQuery.params[0].toISOString(), '2026-09-23T08:30:00.000Z');
    assert.equal(calls.filter(call => call.sql.includes('UPDATE `order`')).length, 2);
    assert.equal(calls.filter(call => call.sql.includes('INSERT INTO order_cancellation')).length, 2);
    assert.deepEqual(refunds, [2]);
});

test('confirmation timeout completes only eligible orders', async () => {
    const database = {
        async query(sql, params) {
            assert.match(sql, /status = 'WORK_DONE'/);
            assert.equal(params[0], now);
            return [[{ id: 11, Userid: 4 }, { id: 12, Userid: 5 }]];
        }
    };
    const completed = [];
    const completer = async (orderId, userId, receivedDatabase) => {
        completed.push({ orderId, userId });
        assert.equal(receivedDatabase, database);
        if (orderId === 12) throw new Error('concurrent update');
    };
    assert.equal(await autoCompleteOrders(database, now, completer), 1);
    assert.deepEqual(completed, [{ orderId: 11, userId: 4 }, { orderId: 12, userId: 5 }]);
});
