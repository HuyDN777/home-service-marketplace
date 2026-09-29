-- Run after 2026_10_01_cash_wallet_settlement.sql.
ALTER TABLE temp_order
    ADD COLUMN payment_context ENUM('BOOKING', 'REPAIR_QUOTE') NOT NULL DEFAULT 'BOOKING' AFTER id,
    ADD COLUMN quote_id INT NULL AFTER payment_context,
    ADD COLUMN employee_id INT NULL AFTER service_id,
    ADD COLUMN commissionable_amount DECIMAL(12,2) NULL AFTER final_price,
    ADD COLUMN expires_at DATETIME NULL AFTER commissionable_amount,
    ADD UNIQUE KEY uq_temp_order_quote (quote_id),
    ADD CONSTRAINT fk_temp_order_quote FOREIGN KEY (quote_id) REFERENCES service_quote(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_temp_order_employee FOREIGN KEY (employee_id) REFERENCES employee(id);
