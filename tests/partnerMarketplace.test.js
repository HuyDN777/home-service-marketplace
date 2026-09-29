const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../services/partnerPassword');
const { claimJob, listAvailableJobs, cancelClaimedJob, getRejectionStats } = require('../services/jobMarketplace');

test('new passwords are hashed; legacy passwords can still sign in', async () => {
    const hashed = await hashPassword('strong-password');
    assert.notEqual(hashed, 'strong-password');
    assert.equal(await verifyPassword('strong-password', hashed), true);
    assert.equal(await verifyPassword('wrong-password', hashed), false);
    assert.equal(await verifyPassword('legacy', 'legacy'), true);
});

function database(order, partner, conflicts = []) {
    const state = { committed: false, rolledBack: false, released: false, updated: false };
    const connection = {
        async beginTransaction() {},
        async query(sql) {
            if (sql.includes('FROM `order` WHERE id = ? FOR UPDATE')) return [[order]];
            if (sql.includes('FROM employee WHERE id = ? FOR UPDATE')) return [[partner]];
            if (sql.includes('start_datetime < ? AND end_datetime > ?')) return [conflicts];
            if (sql.startsWith('UPDATE `order`')) { state.updated = true; return [{ affectedRows: 1 }]; }
            return [[]];
        },
        async commit() { state.committed = true; },
        async rollback() { state.rolledBack = true; },
        release() { state.released = true; }
    };
    return { state, getConnection: async () => connection };
}

const order = { id: 1, Serviceid: 2, Employeeid: null, status: 'PENDING', start_datetime: new Date(Date.now() + 86400000), end_datetime: new Date(Date.now() + 90000000) };
const partner = { Serviceid: 2, active: 1 };

test('eligible CTV can claim a job', async () => {
    const db = database(order, partner);
    assert.deepEqual(await claimJob(1, 7, db), { id: 1, status: 'ASSIGNED' });
    assert.equal(db.state.updated, true);
    assert.equal(db.state.committed, true);
    assert.equal(db.state.released, true);
});

test('claim rejects overlapping work and rolls back', async () => {
    const db = database(order, partner, [{ id: 3 }]);
    await assert.rejects(claimJob(1, 7, db), { status: 409 });
    assert.equal(db.state.updated, false);
    assert.equal(db.state.rolledBack, true);
});

test('claim rejects wrong service and already claimed work', async () => {
    await assert.rejects(claimJob(1, 7, database(order, { Serviceid: 4, active: 1 })), { status: 403 });
    await assert.rejects(claimJob(1, 7, database({ ...order, status: 'ASSIGNED', Employeeid: 8 }, partner)), { status: 409 });
});

test('inactive CTV cannot browse jobs', async () => {
    const db = { query: async () => [[{ Serviceid: 2, active: 0 }]] };
    await assert.rejects(listAvailableJobs(7, db), { status: 403 });
});

test('CTV at the wallet floor cannot browse jobs', async () => {
    const db = { query: async () => [[{ Serviceid: 2, active: 1, accepting_jobs: 1, partner_balance: -200000 }]] };
    await assert.rejects(listAvailableJobs(7, db), { status: 403 });
});

test('CTV cannot claim a job inside the 30 minute cutoff', async () => {
    const nearStart = { ...order, start_datetime: new Date(Date.now() + 20 * 60000) };
    await assert.rejects(claimJob(1, 7, database(nearStart, partner)), { status: 409 });
});

test('CTV can return an assigned job before the cutoff', async () => {
    const state = { committed: false, returned: false };
    const connection = {
        async beginTransaction() {},
        async query(sql) {
            if (sql.includes('AND Employeeid = ? FOR UPDATE')) return [[{
                id: 9,
                status: 'ASSIGNED',
                start_datetime: new Date(Date.now() + 86400000)
            }]];
            if (sql.includes("SET Employeeid = NULL")) state.returned = true;
            return [[]];
        },
        async commit() { state.committed = true; },
        async rollback() {},
        release() {}
    };
    const result = await cancelClaimedJob(9, 7, '', { getConnection: async () => connection });
    assert.deepEqual(result, { id: 9, status: 'PENDING' });
    assert.equal(state.returned, true);
    assert.equal(state.committed, true);
});

test('monthly rejection rate excludes returned jobs from the denominator', async () => {
    const db = { query: async () => [[{
        today: 1,
        this_month: 2,
        accepted_this_month: 8,
        cancelled_this_month: 1,
        total: 3
    }]] };
    assert.deepEqual(await getRejectionStats(7, db), {
        today: 1,
        this_month: 2,
        total: 3,
        accepted_this_month: 8,
        cancelled_this_month: 1,
        rejection_rate_month: 20
    });
});
