-- Run after 2026_10_03_cash_collection_confirmation.sql.
-- Material costs are settled directly between customer and partner.
UPDATE `order` o
JOIN service_quote q ON q.repair_order_id = o.id
SET o.final_amount = q.labor_amount,
    o.commissionable_amount = q.labor_amount
WHERE o.status IN ('ASSIGNED', 'IN_PROGRESS', 'WORK_DONE')
  AND o.payment_status = 'UNPAID';

UPDATE bill b
JOIN service_quote q ON q.repair_order_id = b.Orderid
JOIN `order` o ON o.id = b.Orderid
SET b.amount = q.labor_amount
WHERE o.status IN ('ASSIGNED', 'IN_PROGRESS', 'WORK_DONE')
  AND o.payment_status = 'UNPAID';

UPDATE temp_order t
JOIN service_quote q ON q.id = t.quote_id
SET t.final_price = q.labor_amount,
    t.commissionable_amount = q.labor_amount
WHERE t.payment_context = 'REPAIR_QUOTE';
