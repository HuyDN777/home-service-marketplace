-- Run after 2026_10_06_customer_debt_payment.sql.
ALTER TABLE temp_order
    ADD COLUMN txn_ref VARCHAR(100) NULL AFTER expires_at,
    ADD UNIQUE KEY uq_temp_order_txn_ref (txn_ref);
