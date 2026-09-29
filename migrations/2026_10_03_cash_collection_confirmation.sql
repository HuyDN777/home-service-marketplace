-- Run after 2026_10_02_quote_payment.sql.
ALTER TABLE `order`
    ADD COLUMN cash_collected_at DATETIME NULL AFTER payment_method;
