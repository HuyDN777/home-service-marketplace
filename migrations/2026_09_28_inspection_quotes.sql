-- Run after 2026_09_27_service_pricing.sql.
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order' AND COLUMN_NAME = 'actual_started_at') = 0,
    'ALTER TABLE `order` ADD COLUMN actual_started_at DATETIME NULL AFTER end_datetime', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order' AND COLUMN_NAME = 'actual_finished_at') = 0,
    'ALTER TABLE `order` ADD COLUMN actual_finished_at DATETIME NULL AFTER actual_started_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order' AND COLUMN_NAME = 'commissionable_amount') = 0,
    'ALTER TABLE `order` ADD COLUMN commissionable_amount DECIMAL(12,2) NULL AFTER final_amount', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE `order` SET commissionable_amount = final_amount WHERE commissionable_amount IS NULL;

CREATE TABLE IF NOT EXISTS service_quote (
    id INT AUTO_INCREMENT PRIMARY KEY,
    Orderid INT NOT NULL,
    Employeeid INT NOT NULL,
    repair_order_id INT NULL,
    diagnosis VARCHAR(1000) NOT NULL,
    labor_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    material_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    estimated_duration_minutes INT NOT NULL,
    status ENUM('PENDING', 'ACCEPTED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at DATETIME NULL,
    UNIQUE KEY uq_service_quote_order (Orderid),
    CONSTRAINT fk_service_quote_order FOREIGN KEY (Orderid) REFERENCES `order`(id),
    CONSTRAINT fk_service_quote_employee FOREIGN KEY (Employeeid) REFERENCES employee(id),
    CONSTRAINT fk_service_quote_repair_order FOREIGN KEY (repair_order_id) REFERENCES `order`(id)
);
