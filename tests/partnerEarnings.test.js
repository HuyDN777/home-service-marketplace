const test = require('node:test');
const assert = require('node:assert/strict');
const { calculatePartnerEarning, calculatePlatformCommission, calculateWalletChange } = require('../services/partnerEarnings');

test('partner earning excludes material settled outside the platform', () => {
    assert.equal(calculatePartnerEarning(300000, 200000), 160000);
});

test('legacy orders share the whole order amount', () => {
    assert.equal(calculatePartnerEarning(120000), 96000);
});

test('cash jobs deduct only platform commission from partner wallet', () => {
    assert.equal(calculatePlatformCommission(120000), 24000);
    assert.equal(calculateWalletChange('CASH', 120000, 120000), -24000);
});

test('online jobs only credit the partner share of platform labor', () => {
    assert.equal(calculateWalletChange('ONLINE', 300000, 200000), 160000);
    assert.equal(calculateWalletChange('CASH', 300000, 200000), -40000);
});
