const { VNPay, VnpLocale } = require('vnpay');

function createVnpay() {
    const required = ['VNP_TMN_CODE', 'VNP_HASH_SECRET', 'VNP_URL', 'VNP_RETURN_URL'];
    const missing = required.filter(key => !process.env[key]);
    if (missing.length) throw new Error(`Thiếu cấu hình VNPay: ${missing.join(', ')}`);

    const paymentUrl = new URL(process.env.VNP_URL);
    return new VNPay({
        tmnCode: process.env.VNP_TMN_CODE,
        secureSecret: process.env.VNP_HASH_SECRET,
        vnpayHost: paymentUrl.origin,
        testMode: process.env.NODE_ENV !== 'production',
        hashAlgorithm: 'SHA512',
        vnp_Locale: VnpLocale.VN,
        enableLog: false,
        endpoints: { paymentEndpoint: paymentUrl.pathname.replace(/^\//, '') }
    });
}

module.exports = { createVnpay };
