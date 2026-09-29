const db = require('../config/database');
const { settlePartnerWallet } = require('./partnerEarnings');
const { canCreateBooking, requiresOnlinePayment } = require('./orderPolicy');

class QuoteError extends Error {
    constructor(message, status = 409) {
        super(message);
        this.status = status;
    }
}

function mysqlDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new QuoteError('Thời gian sửa chữa không hợp lệ', 400);
    const pad = number => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function createInspectionQuote(orderId, employeeId, input, database = db) {
    const connection = await database.getConnection();
    try {
        await connection.beginTransaction();
        const diagnosis = String(input.diagnosis || '').trim();
        const noRepairNeeded = input.outcome === 'NO_REPAIR';
        const duration = Number(input.estimated_duration_minutes);
        const catalogInput = Array.isArray(input.catalog_items) ? input.catalog_items : [];
        const customName = String(input.custom_name || '').trim();
        const customPrice = Number(input.custom_labor_amount || 0);
        const materialName = String(input.material_name || '').trim();
        const materialAmount = Number(input.material_amount || 0);
        if (!diagnosis || (!noRepairNeeded && (!Number.isInteger(duration) || duration < 30)) || customPrice < 0 || materialAmount < 0) {
            throw new QuoteError('Vui lòng nhập đầy đủ chẩn đoán, chi phí và thời lượng sửa chữa', 400);
        }
        const [orders] = await connection.query(`SELECT o.id, o.Serviceid FROM \`order\` o
            JOIN service s ON s.id = o.Serviceid WHERE o.id = ? AND o.Employeeid = ?
            AND o.status = 'IN_PROGRESS' AND s.pricing_model = 'INSPECTION' FOR UPDATE`, [orderId, employeeId]);
        if (!orders.length) throw new QuoteError('Ca khảo sát không hợp lệ');

        if (noRepairNeeded) {
            const [quoteResult] = await connection.query(`INSERT INTO service_quote
                (Orderid, Employeeid, diagnosis, labor_amount, material_amount, estimated_duration_minutes, status)
                VALUES (?, ?, ?, 0, 0, 0, 'NOT_REQUIRED')`, [orderId, employeeId, diagnosis]);
            const confirmationHours = Math.max(1, Number(process.env.CUSTOMER_CONFIRMATION_HOURS || 24));
            await connection.query(`UPDATE \`order\` SET status = 'WORK_DONE', actual_finished_at = NOW(),
                confirmation_due_at = DATE_ADD(NOW(), INTERVAL ${confirmationHours} HOUR) WHERE id = ?`, [orderId]);
            await connection.commit();
            return { quoteId: quoteResult.insertId, noRepairNeeded: true };
        }

        const quantities = new Map(catalogInput.map(item => [Number(item.id), Number(item.quantity)]).filter(([id, quantity]) => Number.isInteger(id) && quantity > 0));
        let catalogItems = [];
        if (quantities.size) {
            const ids = [...quantities.keys()];
            [catalogItems] = await connection.query(`SELECT id, name, unit, labor_price FROM repair_catalog_item
                WHERE Serviceid = ? AND active = 1 AND id IN (?)`, [orders[0].Serviceid, ids]);
            if (catalogItems.length !== ids.length) throw new QuoteError('Có hạng mục không thuộc bảng giá dịch vụ', 400);
        }
        if (!catalogItems.length && !(customName && customPrice > 0)) throw new QuoteError('Hãy chọn ít nhất một hạng mục hoặc thêm hạng mục khác', 400);
        if (customPrice > 0 && !customName) throw new QuoteError('Hạng mục khác cần có mô tả', 400);
        if (materialAmount > 0 && !materialName) throw new QuoteError('Vật liệu phát sinh cần có mô tả', 400);

        const laborAmount = catalogItems.reduce((sum, item) => sum + Number(item.labor_price) * quantities.get(Number(item.id)), 0) + customPrice;
        const requiresReview = customPrice > 0 ? 1 : 0;
        const [quoteResult] = await connection.query(`INSERT INTO service_quote
            (Orderid, Employeeid, diagnosis, labor_amount, material_amount, estimated_duration_minutes, requires_review)
            VALUES (?, ?, ?, ?, ?, ?, ?)`, [orderId, employeeId, diagnosis, laborAmount, materialAmount, duration, requiresReview]);
        for (const item of catalogItems) {
            const quantity = quantities.get(Number(item.id));
            await connection.query(`INSERT INTO service_quote_item
                (quote_id, catalog_item_id, item_type, item_name, quantity, unit, unit_price, line_total)
                VALUES (?, ?, 'CATALOG', ?, ?, ?, ?, ?)`, [quoteResult.insertId, item.id, item.name, quantity, item.unit, item.labor_price, Number(item.labor_price) * quantity]);
        }
        if (customName && customPrice > 0) await connection.query(`INSERT INTO service_quote_item
            (quote_id, item_type, item_name, quantity, unit, unit_price, line_total)
            VALUES (?, 'CUSTOM', ?, 1, 'lần', ?, ?)`, [quoteResult.insertId, customName, customPrice, customPrice]);
        if (materialName && materialAmount > 0) await connection.query(`INSERT INTO service_quote_item
            (quote_id, item_type, item_name, quantity, unit, unit_price, line_total)
            VALUES (?, 'MATERIAL', ?, 1, 'gói', ?, ?)`, [quoteResult.insertId, materialName, materialAmount, materialAmount]);
        const confirmationHours = Math.max(1, Number(process.env.CUSTOMER_CONFIRMATION_HOURS || 24));
        await connection.query(`UPDATE \`order\` SET status = 'WORK_DONE', actual_finished_at = NOW(),
            confirmation_due_at = DATE_ADD(NOW(), INTERVAL ${confirmationHours} HOUR) WHERE id = ?`, [orderId]);
        await connection.commit();
        return { quoteId: quoteResult.insertId, laborAmount, materialAmount, requiresReview };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function respondToQuote(orderId, userId, input, database = db) {
    const connection = await database.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query(`
            SELECT o.*, q.id AS quote_id, q.status AS quote_status, q.labor_amount,
                q.material_amount, q.estimated_duration_minutes
            FROM \`order\` o JOIN service_quote q ON q.Orderid = o.id
            WHERE o.id = ? FOR UPDATE`, [orderId]);
        const order = rows[0];
        if (!order || Number(order.Userid) !== Number(userId)) throw new QuoteError('Không tìm thấy báo giá', 404);
        if (order.status !== 'WORK_DONE' || order.quote_status !== 'PENDING') throw new QuoteError('Báo giá đã được xử lý');
        if (!['ACCEPTED', 'REJECTED'].includes(input.decision)) throw new QuoteError('Lựa chọn không hợp lệ', 400);

        if (input.decision === 'REJECTED') {
            await connection.query("UPDATE service_quote SET status = 'REJECTED', responded_at = NOW() WHERE id = ?", [order.quote_id]);
            await completeInspection(connection, order);
            await connection.commit();
            return { decision: 'REJECTED' };
        }

        const paymentMethod = String(input.payment_method || '').toUpperCase();
        if (!['CASH', 'ONLINE'].includes(paymentMethod)) {
            throw new QuoteError('Vui lòng chọn phương thức thanh toán', 400);
        }
        const start = mysqlDate(input.start_datetime);
        const end = mysqlDate(new Date(new Date(input.start_datetime).getTime() + Number(order.estimated_duration_minutes) * 60000));
        if (new Date(input.start_datetime).getTime() < Date.now()) throw new QuoteError('Lịch sửa chữa phải ở tương lai', 400);
        if (!canCreateBooking(start)) {
            throw new QuoteError('Lịch sửa chữa cần được đặt trước ít nhất 60 phút', 400);
        }
        if (requiresOnlinePayment(start) && paymentMethod !== 'ONLINE') {
            throw new QuoteError('Ca sửa trong vòng 2 giờ phải thanh toán online', 400);
        }
        const [conflicts] = await connection.query(`
            SELECT id FROM \`order\` WHERE Employeeid = ? AND id <> ?
              AND status IN ('ASSIGNED', 'IN_PROGRESS') AND start_datetime < ? AND end_datetime > ? LIMIT 1`,
        [order.Employeeid, order.id, end, start]);
        if (conflicts.length) throw new QuoteError('CTV đã có ca khác trong thời gian này');

        const total = Number(order.labor_amount);
        if (paymentMethod === 'ONLINE') {
            const [pending] = await connection.query('SELECT id FROM temp_order WHERE quote_id = ? LIMIT 1', [order.quote_id]);
            let tempOrderId = pending[0]?.id;
            if (!tempOrderId) {
                const [tempResult] = await connection.query(`INSERT INTO temp_order
                    (payment_context, quote_id, user_id, service_id, employee_id, booking_date,
                     implementing_date, start_datetime, end_datetime, address, note, final_price,
                     commissionable_amount, expires_at)
                    VALUES ('REPAIR_QUOTE', ?, ?, ?, ?, CURDATE(), DATE(?), ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
                [order.quote_id, order.Userid, order.Serviceid, order.Employeeid, start, start, end,
                    order.address, `Sửa chữa theo báo giá khảo sát #${order.id}`, total, order.labor_amount]);
                tempOrderId = tempResult.insertId;
            } else {
                await connection.query(`UPDATE temp_order SET employee_id = ?, implementing_date = DATE(?),
                    start_datetime = ?, end_datetime = ?, address = ?, note = ?, final_price = ?,
                    commissionable_amount = ?, expires_at = DATE_ADD(NOW(), INTERVAL 30 MINUTE) WHERE id = ?`,
                [order.Employeeid, start, start, end, order.address,
                    `Sửa chữa theo báo giá khảo sát #${order.id}`, total, order.labor_amount, tempOrderId]);
            }
            await connection.commit();
            return { decision: 'PAYMENT_REQUIRED', temp_order_id: tempOrderId, amount: total };
        }
        const [result] = await connection.query(`
            INSERT INTO \`order\` (Userid, Serviceid, Employeeid, booking_date, implementing_date,
                start_datetime, end_datetime, status, payment_status, payment_method, final_amount,
                commissionable_amount, address, note)
            VALUES (?, ?, ?, CURDATE(), DATE(?), ?, ?, 'ASSIGNED', 'UNPAID', 'CASH', ?, ?, ?, ?)`,
        [order.Userid, order.Serviceid, order.Employeeid, start, start, end, total,
            order.labor_amount, order.address, `Sửa chữa theo báo giá khảo sát #${order.id}`]);
        await connection.query("UPDATE service_quote SET status = 'ACCEPTED', repair_order_id = ?, responded_at = NOW() WHERE id = ?", [result.insertId, order.quote_id]);
        await connection.query("INSERT INTO bill (amount, status, date, Orderid) VALUES (?, 'chua thanh toan', NOW(), ?)", [total, result.insertId]);
        await completeInspection(connection, order);
        await connection.commit();
        return { decision: 'ACCEPTED', repair_order_id: result.insertId };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function completeQuoteOnlinePayment(tempOrderId, paymentTransaction, database = db) {
    const connection = await database.getConnection();
    try {
        await connection.beginTransaction();
        const [completedPayments] = await connection.query(
            "SELECT Orderid FROM payment_transaction WHERE provider = 'VNPAY' AND txn_ref = ? LIMIT 1 FOR UPDATE",
            [paymentTransaction.txnRef]
        );
        if (completedPayments.length) {
            await connection.commit();
            return { repairOrderId: completedPayments[0].Orderid, alreadyPaid: true };
        }
        const [rows] = await connection.query(`SELECT t.*, q.Orderid, q.status AS quote_status,
                q.labor_amount, q.material_amount, o.payment_method AS inspection_payment_method,
                o.payment_status AS inspection_payment_status, o.final_amount AS inspection_final_amount,
                o.commissionable_amount AS inspection_commissionable_amount
            FROM temp_order t
            JOIN service_quote q ON q.id = t.quote_id
            JOIN \`order\` o ON o.id = q.Orderid
            WHERE t.id = ? AND t.payment_context = 'REPAIR_QUOTE' FOR UPDATE`, [tempOrderId]);
        const temp = rows[0];
        if (!temp) {
            const [completedAfterLock] = await connection.query(
                "SELECT Orderid FROM payment_transaction WHERE provider = 'VNPAY' AND txn_ref = ? LIMIT 1 FOR UPDATE",
                [paymentTransaction.txnRef]
            );
            if (completedAfterLock.length) {
                await connection.commit();
                return { repairOrderId: completedAfterLock[0].Orderid, alreadyPaid: true };
            }
            throw new QuoteError('Không tìm thấy yêu cầu thanh toán sửa chữa', 404);
        }
        if (temp.quote_status !== 'PENDING') throw new QuoteError('Báo giá đã được xử lý');
        if (temp.txn_ref && String(temp.txn_ref) !== String(paymentTransaction.txnRef)) {
            throw new QuoteError('Mã giao dịch thanh toán không khớp', 400);
        }
        if (Number(paymentTransaction.amount) !== Number(temp.final_price)) {
            throw new QuoteError('Số tiền thanh toán không khớp', 400);
        }

        const [conflicts] = await connection.query(`SELECT id FROM \`order\`
            WHERE Employeeid = ? AND status IN ('ASSIGNED', 'IN_PROGRESS')
              AND start_datetime < ? AND end_datetime > ? LIMIT 1`,
        [temp.employee_id, temp.end_datetime, temp.start_datetime]);
        if (conflicts.length) throw new QuoteError('CTV đã có ca khác trong thời gian này');

        const [result] = await connection.query(`INSERT INTO \`order\`
            (Userid, Serviceid, Employeeid, booking_date, implementing_date, start_datetime,
             end_datetime, status, payment_status, payment_method, final_amount,
             commissionable_amount, address, note)
            VALUES (?, ?, ?, CURDATE(), DATE(?), ?, ?, 'ASSIGNED', 'PAID', 'ONLINE', ?, ?, ?, ?)`,
        [temp.user_id, temp.service_id, temp.employee_id, temp.start_datetime, temp.start_datetime,
            temp.end_datetime, temp.final_price, temp.commissionable_amount, temp.address, temp.note]);
        await connection.query("UPDATE service_quote SET status = 'ACCEPTED', repair_order_id = ?, responded_at = NOW() WHERE id = ?",
            [result.insertId, temp.quote_id]);
        await connection.query("INSERT INTO bill (amount, status, date, Orderid) VALUES (?, 'da thanh toan', NOW(), ?)",
            [temp.final_price, result.insertId]);
        await connection.query(`INSERT INTO payment_transaction
            (Orderid, txn_ref, provider_transaction_no, transaction_date, amount, bank_code, status, raw_response)
            VALUES (?, ?, ?, ?, ?, ?, 'PAID', ?)`,
        [result.insertId, paymentTransaction.txnRef, paymentTransaction.providerTransactionNo,
            paymentTransaction.transactionDate, temp.final_price, paymentTransaction.bankCode,
            paymentTransaction.rawResponse]);
        await completeInspection(connection, {
            id: temp.Orderid,
            Employeeid: temp.employee_id,
            payment_method: temp.inspection_payment_method,
            payment_status: temp.inspection_payment_status,
            final_amount: temp.inspection_final_amount,
            commissionable_amount: temp.inspection_commissionable_amount
        });
        await connection.query('DELETE FROM temp_order WHERE id = ?', [tempOrderId]);
        await connection.commit();
        return { repairOrderId: result.insertId, amount: Number(temp.final_price) };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function completeInspection(connection, order) {
    await connection.query("UPDATE `order` SET status = 'COMPLETED' WHERE id = ?", [order.id]);
    if (order.payment_method === 'ONLINE') {
        await settlePartnerWallet(connection, order, `đơn khảo sát #${order.id}`);
    }
}

module.exports = { createInspectionQuote, respondToQuote, completeQuoteOnlinePayment, QuoteError };
