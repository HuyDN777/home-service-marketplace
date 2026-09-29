-- Run after 2026_09_08_order_workflow.sql.
ALTER TABLE `order`
    ADD COLUMN offer_expires_at DATETIME NULL AFTER end_datetime,
    ADD INDEX idx_order_offer_expiry (status, offer_expires_at);

ALTER TABLE employee
    ADD COLUMN accepting_jobs TINYINT(1) NOT NULL DEFAULT 1 AFTER active;

UPDATE `order` SET offer_expires_at = DATE_ADD(NOW(), INTERVAL 2 MINUTE)
WHERE status = 'OFFERED' AND offer_expires_at IS NULL;
