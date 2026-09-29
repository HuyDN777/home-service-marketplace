const { ProductCode, VnpLocale, dateFormat } = require('vnpay');
const db = require('../../config/database');
const { createVnpay } = require('../../config/vnpay');
const { cancelByCustomer } = require('../../services/orderCancellation');
const { requestOrderRefund, queryOrderRefund } = require('../../services/vnpayRefund');
const { canCreateBooking, requiresOnlinePayment } = require('../../services/orderPolicy');
const { completeOrderAndCreditPartner } = require('../../services/partnerEarnings');
const { respondToQuote, completeQuoteOnlinePayment } = require('../../services/inspectionQuote');
const { publish } = require('../../services/realtime');
const { getUnpaidDebt, createDebtPayment, setDebtPaymentTxnRef, completeDebtPayment } = require('../../services/customerDebtPayment');
const { reserveTempOrderTxnRef, completeBookingOnlinePayment } = require('../../services/onlineBookingPayment');
const { openDispute } = require('../../services/orderDispute');

const DEFAULT_DURATION_MINUTES = 120;

function toMysqlDatetime(value) {
    const date = new Date(value);
    const pad = number => String(number).padStart(2, '0');
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join('-') + ' ' + [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds())
    ].join(':');
}

function getVnpayTransactionDate(txnRef, fallback) {
    const timestamp = Number(String(txnRef || '').split('-').pop());
    return Number.isSafeInteger(timestamp) ? String(dateFormat(new Date(timestamp))) : String(fallback);
}

function parsePaymentId(orderInfo, prefix) {
    if (!String(orderInfo || '').startsWith(prefix)) return null;
    const id = Number(String(orderInfo).slice(prefix.length));
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function processVerifiedPayment(verification) {
    const info = String(verification.vnp_OrderInfo || '');
    const common = {
        ...verification,
        txnRef: verification.vnp_TxnRef,
        providerTransactionNo: verification.vnp_TransactionNo || null,
        transactionDate: getVnpayTransactionDate(verification.vnp_TxnRef, verification.vnp_PayDate),
        bankCode: verification.vnp_BankCode || null,
        amount: Number(verification.vnp_Amount),
        rawResponse: JSON.stringify(verification)
    };

    const debtId = parsePaymentId(info, 'DEBT_');
    if (debtId) {
        const result = await completeDebtPayment(debtId, verification);
        return { kind: 'DEBT', alreadyPaid: Boolean(result.alreadyPaid) };
    }
    const quoteId = parsePaymentId(info, 'REPAIRQUOTE_');
    if (quoteId) {
        const result = await completeQuoteOnlinePayment(quoteId, common);
        publish('orders_changed', { order_id: result.repairOrderId });
        return { kind: 'REPAIR_QUOTE', orderId: result.repairOrderId, alreadyPaid: Boolean(result.alreadyPaid) };
    }
    const bookingId = parsePaymentId(info, 'TEMPORDER_');
    if (bookingId) {
        const result = await completeBookingOnlinePayment(bookingId, common);
        publish('orders_changed', { order_id: result.orderId });
        return { kind: 'BOOKING', orderId: result.orderId, alreadyPaid: Boolean(result.alreadyPaid) };
    }
    const error = new Error('Mã giao dịch không hợp lệ');
    error.status = 404;
    throw error;
}

function buildSchedule(body, defaultDurationMinutes = DEFAULT_DURATION_MINUTES) {
    const implementingDate = body.implementing_date;
    const startTime = body.start_time || '08:00';
    const durationMinutes = parseInt(body.duration_minutes, 10) || Number(defaultDurationMinutes) || DEFAULT_DURATION_MINUTES;
    const startRaw = body.start_datetime || `${implementingDate}T${startTime}`;
    const startDate = new Date(startRaw);
    const endDate = body.end_datetime
        ? new Date(body.end_datetime)
        : new Date(startDate.getTime() + durationMinutes * 60000);

    return {
        implementing_date: implementingDate,
        start_datetime: toMysqlDatetime(startDate),
        end_datetime: toMysqlDatetime(endDate)
    };
}

async function calculateOrder(req) {
    const { service_id, coupon_code } = req.body;
    const [services] = await db.query('SELECT * FROM service WHERE id = ?', [service_id]);
    if (services.length === 0) {
        const error = new Error('Dich vu khong ton tai');
        error.status = 400;
        throw error;
    }

    const service = services[0];
    const pricingModel = service.pricing_model || 'FIXED';
    const durationMinutes = parseInt(req.body.duration_minutes, 10) || Number(service.default_duration_minutes) || DEFAULT_DURATION_MINUTES;
    let quantity = Number(req.body.quantity || 1);
    if (pricingModel === 'HOURLY') quantity = durationMinutes / 60;
    if (['FIXED', 'INSPECTION'].includes(pricingModel)) quantity = 1;
    if (!Number.isFinite(quantity) || quantity <= 0 || (pricingModel === 'PER_UNIT' && !Number.isInteger(quantity))) {
        const error = new Error('Số lượng dịch vụ không hợp lệ');
        error.status = 400;
        throw error;
    }
    const price = Number(service.price) * quantity;
    let promotionId = null;
    let discount = 0;

    if (coupon_code) {
        const [promotions] = await db.query(`SELECT * FROM promotion
            WHERE code = ? AND CURDATE() BETWEEN start_date AND end_date`, [coupon_code]);
        if (promotions.length === 0) {
            const error = new Error('Ma khuyen mai khong hop le');
            error.status = 400;
            throw error;
        }
        promotionId = promotions[0].id;
        discount = Number(promotions[0].discount);
        if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
            const error = new Error('Mức giảm giá không hợp lệ');
            error.status = 400;
            throw error;
        }
    }

    return { service, promotionId, discount, quantity, final_price: price * (1 - discount / 100) };
}

async function createRealOrder({ userId, body, promotionId, paymentStatus, paymentMethod, finalAmount }) {
    const schedule = buildSchedule(body);
    const [orderResult] = await db.query(
        `INSERT INTO \`order\`
            (Userid, Serviceid, Employeeid, booking_date, implementing_date, start_datetime, end_datetime, Promotionid, status, payment_status, payment_method, final_amount, address, note)
        VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?)`,
        [
            userId,
            body.service_id,
            body.booking_date,
            schedule.implementing_date,
            schedule.start_datetime,
            schedule.end_datetime,
            promotionId,
            paymentStatus,
            paymentMethod,
            finalAmount,
            body.address,
            body.note
        ]
    );

    const orderId = orderResult.insertId;
    return { orderId, schedule, status: 'PENDING' };
}

const orderUserController = {
    async order(req, res) {
        try {
            const userId = req.user.id;
            const { service, promotionId, discount, quantity, final_price } = await calculateOrder(req);
            const { payment_method } = req.body;
            if (!['pay_later', 'pay_now'].includes(payment_method)) {
                return res.status(400).json({ error: 'Phương thức thanh toán không hợp lệ' });
            }
            const schedule = buildSchedule(req.body, service.default_duration_minutes);
            if (!canCreateBooking(schedule.start_datetime)) {
                return res.status(400).json({ error: 'Vui lòng đặt lịch trước giờ thực hiện ít nhất 60 phút' });
            }
            const [debts] = await db.query(
                "SELECT COALESCE(SUM(amount), 0) AS total FROM customer_debt WHERE Userid = ? AND status = 'UNPAID'",
                [userId]
            );
            if (Number(debts[0].total) > 0) {
                return res.status(409).json({ error: `Bạn còn phí hủy ${Number(debts[0].total).toLocaleString('vi-VN')}đ. Vui lòng thanh toán trước khi đặt đơn mới.`, debt_amount: Number(debts[0].total) });
            }
            if (requiresOnlinePayment(schedule.start_datetime) && payment_method !== 'pay_now') {
                return res.status(400).json({ error: 'Đơn đặt trong vòng 2 giờ phải thanh toán online' });
            }

            if (payment_method === 'pay_now') {
                const [tempOrderResult] = await db.query(
                    `INSERT INTO temp_order
                        (user_id, service_id, booking_date, implementing_date, start_datetime, end_datetime, address, note, promotion_id, discount, final_price, expires_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
                    [
                        userId,
                        req.body.service_id,
                        req.body.booking_date,
                        schedule.implementing_date,
                        schedule.start_datetime,
                        schedule.end_datetime,
                        req.body.address,
                        req.body.note,
                        promotionId,
                        discount,
                        final_price
                    ]
                );

                const vnpay = createVnpay();

                const txnRef = await reserveTempOrderTxnRef(
                    tempOrderResult.insertId,
                    `${tempOrderResult.insertId}-${Date.now()}`
                );
                const paymentUrl = await vnpay.buildPaymentUrl({
                    vnp_OrderInfo: `TEMPORDER_${tempOrderResult.insertId}`,
                    vnp_IpAddr: req.ip || req.socket.remoteAddress || '127.0.0.1',
                    vnp_OrderType: ProductCode.Other,
                    vnp_Amount: final_price,
                    vnp_ReturnUrl: process.env.VNP_RETURN_URL,
                    vnp_TxnRef: txnRef,
                    vnp_Locale: VnpLocale.VN,
                    vnp_CreateDate: dateFormat(new Date()),
                    vnp_ExpireDate: dateFormat(new Date(Date.now() + 30 * 60 * 1000))
                });

                return res.json({ paymentUrl });
            }

            const { orderId, status } = await createRealOrder({
                userId,
                body: req.body,
                promotionId,
                paymentStatus: 'UNPAID',
                paymentMethod: 'CASH',
                finalAmount: final_price
            });

            await db.query(
                'INSERT INTO bill (amount, status, date, Orderid) VALUES (?, ?, NOW(), ?)',
                [final_price, 'chua thanh toan', orderId]
            );
            publish('orders_changed', { order_id: orderId });

            return res.json({
                message: 'Da dang cong viec. Cong tac vien phu hop co the xem va nhan ca.',
                order: {
                    id: orderId,
                    service_name: service.name,
                    booking_date: req.body.booking_date,
                    implementing_date: schedule.implementing_date,
                    start_datetime: schedule.start_datetime,
                    end_datetime: schedule.end_datetime,
                    address: req.body.address,
                    note: req.body.note,
                    price_per_unit: service.price,
                    quantity,
                    discount,
                    final_price,
                    status,
                    payment_status: 'UNPAID'
                },
                employee: null
            });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message || 'Loi khi dat hang' });
        }
    },

    async orderProcessing(req, res) {
        try {
            const verification = createVnpay().verifyReturnUrl(req.query);
            if (!verification.isVerified) return res.status(400).send('Du lieu thanh toan khong hop le.');
            if (!verification.isSuccess) return res.status(400).send('Thanh toan that bai hoac bi huy.');
            const completed = await processVerifiedPayment(verification);
            if (completed.kind === 'DEBT') {
                return res.redirect('/order-history?debtPaid=1');
            }
            res.redirect(`/order-success/${completed.orderId}`);
        } catch (err) {
            res.send('Thanh toan that bai');
        }
    },

    async debtSummary(req, res) {
        try {
            res.json(await getUnpaidDebt(req.user.id));
        } catch (error) {
            res.status(500).json({ error: 'Không thể tải phí hủy cần thanh toán' });
        }
    },

    async payDebt(req, res) {
        try {
            const payment = await createDebtPayment(req.user.id);
            const txnRef = payment.txn_ref || await setDebtPaymentTxnRef(payment.id, `debt-${payment.id}-${Date.now()}`);
            const paymentUrl = await createVnpay().buildPaymentUrl({
                vnp_OrderInfo: `DEBT_${payment.id}`,
                vnp_IpAddr: req.ip || req.socket.remoteAddress || '127.0.0.1',
                vnp_OrderType: ProductCode.Other,
                vnp_Amount: Number(payment.amount),
                vnp_ReturnUrl: process.env.VNP_RETURN_URL,
                vnp_TxnRef: txnRef,
                vnp_Locale: VnpLocale.VN,
                vnp_CreateDate: dateFormat(new Date()),
                vnp_ExpireDate: dateFormat(new Date(Date.now() + 30 * 60 * 1000))
            });
            res.json({ paymentUrl, amount: Number(payment.amount) });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.status ? error.message : 'Không thể tạo giao dịch thanh toán' });
        }
    },

    async vnpayIpn(req, res) {
        try {
            const verification = createVnpay().verifyIpnCall(req.query);
            if (!verification.isVerified) return res.json({ RspCode: '97', Message: 'Invalid Checksum' });
            if (!verification.isSuccess) return res.json({ RspCode: '00', Message: 'Confirm Success' });
            const result = await processVerifiedPayment(verification);
            return res.json(result.alreadyPaid
                ? { RspCode: '02', Message: 'Order already confirmed' }
                : { RspCode: '00', Message: 'Confirm Success' });
        } catch (error) {
            if (error.status === 404) return res.json({ RspCode: '01', Message: 'Order not found' });
            if (error.status === 400) return res.json({ RspCode: '04', Message: 'Invalid amount' });
            console.error('VNPAY IPN failed:', error);
            return res.json({ RspCode: '99', Message: 'Unknown error' });
        }
    },

    async orderHistory(req, res) {
        try {
            const page = parseInt(req.query.page, 10) || 1;
            const pageSize = parseInt(req.query.pageSize || req.query.limit, 10) || 10;
            const offset = (page - 1) * pageSize;
            const userId = req.user.id;

            const [countRows] = await db.query('SELECT COUNT(*) as total FROM `order` WHERE Userid = ?', [userId]);
            const totalOrders = countRows[0].total;
            const totalPages = Math.ceil(totalOrders / pageSize);

            const [orders] = await db.query(`
                SELECT o.id, o.implementing_date, o.start_datetime, o.end_datetime, o.status, o.payment_status, o.confirmation_due_at,
                    s.name as service_name, s.pricing_model, e.name as employee_name, e.phone as employee_phone, o.address, o.note,
                    o.payment_method, o.final_amount, o.cancelled_by, o.cancellation_reason,
                    oc.fee_amount AS cancellation_fee, oc.fee_status AS cancellation_fee_status,
                    rt.amount AS refund_amount, rt.status AS refund_status,
                    q.diagnosis AS quote_diagnosis, q.labor_amount, q.material_amount,
                    q.estimated_duration_minutes, q.status AS quote_status, q.repair_order_id, q.requires_review,
                    d.reason AS dispute_reason, d.status AS dispute_status, d.admin_note AS dispute_admin_note
                FROM \`order\` o
                LEFT JOIN service s ON o.Serviceid = s.id
                LEFT JOIN employee e ON o.Employeeid = e.id
                LEFT JOIN order_cancellation oc ON oc.Orderid = o.id
                LEFT JOIN refund_transaction rt ON rt.Orderid = o.id
                LEFT JOIN service_quote q ON q.Orderid = o.id
                LEFT JOIN order_dispute d ON d.Orderid = o.id
                WHERE o.Userid = ?
                ORDER BY o.start_datetime DESC
                LIMIT ? OFFSET ?
            `, [userId, pageSize, offset]);

            for (const order of orders) {
                const [fb] = await db.query('SELECT id, rating, comment, admin_reply FROM feedback WHERE Orderid = ?', [order.id]);
                order.feedback = fb[0] || null;
                if (order.quote_status) {
                    const [items] = await db.query(`SELECT item_type, item_name, quantity, unit, unit_price, line_total
                        FROM service_quote_item WHERE quote_id = (SELECT id FROM service_quote WHERE Orderid = ?) ORDER BY id`, [order.id]);
                    order.quote_items = items;
                }
            }

            res.json({ orders, page, pageSize, totalOrders, totalPages });
        } catch (err) {
            res.status(500).json({ error: 'Loi khi lay lich su don hang' });
        }
    },

    async confirmOrder(req, res) {
        const orderId = req.params.id;
        const userId = req.user.id;

        try {
            const [pendingQuotes] = await db.query("SELECT id FROM service_quote WHERE Orderid = ? AND status = 'PENDING' LIMIT 1", [orderId]);
            if (pendingQuotes.length) return res.status(409).json({ error: 'Vui lòng chấp nhận hoặc từ chối báo giá trước' });
            const result = await completeOrderAndCreditPartner(orderId, userId);
            publish('orders_changed', { order_id: Number(orderId) });
            res.json({ message: 'Cảm ơn bạn đã xác nhận. Đơn hàng đã hoàn thành.', order: result });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.status ? err.message : 'Lỗi khi xác nhận đơn hàng' });
        }
    },

    async disputeOrder(req, res) {
        try {
            const result = await openDispute(req.params.id, req.user.id, req.body.reason);
            publish('orders_changed', { order_id: Number(req.params.id) });
            res.json({ message: 'Đã gửi yêu cầu hỗ trợ. Đơn sẽ được tạm giữ để kiểm tra.', result });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.status ? error.message : 'Không thể gửi yêu cầu hỗ trợ' });
        }
    },

    async respondToQuote(req, res) {
        try {
            const result = await respondToQuote(req.params.id, req.user.id, req.body);
            if (result.decision === 'PAYMENT_REQUIRED') {
                const txnRef = await reserveTempOrderTxnRef(
                    result.temp_order_id,
                    `repair-${result.temp_order_id}-${Date.now()}`
                );
                const paymentUrl = await createVnpay().buildPaymentUrl({
                    vnp_OrderInfo: `REPAIRQUOTE_${result.temp_order_id}`,
                    vnp_IpAddr: req.ip || req.socket.remoteAddress || '127.0.0.1',
                    vnp_OrderType: ProductCode.Other,
                    vnp_Amount: result.amount,
                    vnp_ReturnUrl: process.env.VNP_RETURN_URL,
                    vnp_TxnRef: txnRef,
                    vnp_Locale: VnpLocale.VN,
                    vnp_CreateDate: dateFormat(new Date()),
                    vnp_ExpireDate: dateFormat(new Date(Date.now() + 30 * 60 * 1000))
                });
                return res.json({ message: 'Chuyển đến VNPAY để thanh toán báo giá sửa chữa.', paymentUrl });
            }
            publish('orders_changed', { order_id: Number(req.params.id), repair_order_id: result.repair_order_id || null });
            res.json({ message: result.decision === 'ACCEPTED' ? `Đã xác nhận báo giá và tạo ca sửa chữa #${result.repair_order_id}` : 'Đã từ chối báo giá và kết thúc đơn khảo sát', result });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.status ? error.message : 'Không thể xử lý báo giá' });
        }
    },

    async cancelOrder(req, res) {
        try {
            const result = await cancelByCustomer(req.params.id, req.user.id, req.body.reason);
            publish('orders_changed', { order_id: Number(req.params.id) });
            let refund = null;
            if (result.payment_status === 'PENDING_REFUND') {
                try {
                    refund = await requestOrderRefund(
                        result.id,
                        req.ip || req.socket.remoteAddress || '127.0.0.1'
                    );
                } catch (refundError) {
                    refund = { status: 'FAILED', message: refundError.message };
                }
            }
            res.json({
                message: result.payment_method === 'ONLINE'
                    ? `Đã hủy đơn. Yêu cầu hoàn ${result.refund_amount.toLocaleString('vi-VN')}đ đã được ghi nhận${result.fee ? `, khấu trừ phí hủy ${result.fee.toLocaleString('vi-VN')}đ` : ''}.`
                    : result.fee > 0
                    ? `Đã hủy đơn. Phí hủy ${result.fee.toLocaleString('vi-VN')}đ sẽ được thu ở lần đặt tiếp theo.`
                    : 'Đã hủy đơn thành công.',
                cancellation: result,
                refund
            });
        } catch (error) {
            console.error('Cancel order failed:', error);
            res.status(error.status || 500).json({ error: error.status ? error.message : 'Không thể hủy đơn' });
        }
    },

    async refundStatus(req, res) {
        try {
            const [orders] = await db.query('SELECT id FROM `order` WHERE id = ? AND Userid = ?', [req.params.id, req.user.id]);
            if (!orders.length) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
            const result = await queryOrderRefund(req.params.id, req.ip || req.socket.remoteAddress || '127.0.0.1');
            publish('orders_changed', { order_id: Number(req.params.id) });
            res.json({
                message: result.status === 'COMPLETED'
                    ? 'Tiền đã được chuyển sang ngân hàng của bạn.'
                    : result.duplicate_query
                        ? 'Bạn vừa kiểm tra gần đây. VNPAY vẫn đang xử lý, vui lòng kiểm tra lại sau ít phút.'
                        : 'VNPAY vẫn đang xử lý yêu cầu hoàn tiền.',
                refund: result
            });
        } catch (error) {
            console.error('Query refund failed:', error);
            res.status(error.status || 500).json({ error: error.message || 'Không kiểm tra được trạng thái hoàn tiền' });
        }
    },

    async orderSuccessful(req, res) {
        const orderId = req.params.orderId;
        const [orders] = await db.query(`
            SELECT o.*, s.name as service_name, s.unit, e.name as employee_name, e.phone as employee_phone,
                b.amount, b.status as bill_status
            FROM \`order\` o
            LEFT JOIN service s ON o.Serviceid = s.id
            LEFT JOIN employee e ON o.Employeeid = e.id
            LEFT JOIN bill b ON b.Orderid = o.id
            WHERE o.id = ?
        `, [orderId]);

        if (orders.length === 0) return res.send('Khong tim thay don hang!');
        res.render('users/order_success', { order: orders[0] });
    }
};

module.exports = orderUserController;
