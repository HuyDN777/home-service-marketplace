-- Run after 2026_09_28_inspection_quotes.sql.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS repair_catalog_item (
    id INT AUTO_INCREMENT PRIMARY KEY,
    Serviceid INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    unit VARCHAR(50) NOT NULL DEFAULT 'lần',
    labor_price DECIMAL(12,2) NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_repair_catalog_service_name (Serviceid, name),
    CONSTRAINT fk_repair_catalog_service FOREIGN KEY (Serviceid) REFERENCES service(id)
);

CREATE TABLE IF NOT EXISTS service_quote_item (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quote_id INT NOT NULL,
    catalog_item_id INT NULL,
    item_type ENUM('CATALOG', 'CUSTOM', 'MATERIAL') NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit VARCHAR(50) NOT NULL DEFAULT 'lần',
    unit_price DECIMAL(12,2) NOT NULL,
    line_total DECIMAL(12,2) NOT NULL,
    evidence_url VARCHAR(500) NULL,
    CONSTRAINT fk_quote_item_quote FOREIGN KEY (quote_id) REFERENCES service_quote(id) ON DELETE CASCADE,
    CONSTRAINT fk_quote_item_catalog FOREIGN KEY (catalog_item_id) REFERENCES repair_catalog_item(id)
);

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_quote' AND COLUMN_NAME = 'requires_review') = 0,
    'ALTER TABLE service_quote ADD COLUMN requires_review TINYINT(1) NOT NULL DEFAULT 0 AFTER status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO repair_catalog_item (Serviceid, name, unit, labor_price) VALUES
    (24, 'Kiểm tra và xử lý chập điện nhẹ', 'lần', 150000),
    (24, 'Thay ổ cắm điện', 'cái', 80000),
    (24, 'Thay công tắc điện', 'cái', 70000),
    (24, 'Lắp đèn hoặc quạt trần', 'cái', 180000),
    (24, 'Đi lại dây điện nổi', 'mét', 50000),
    (25, 'Thông tắc nhẹ', 'điểm', 180000),
    (25, 'Thay vòi nước', 'cái', 120000),
    (25, 'Thay siphon hoặc ống thoát', 'bộ', 150000),
    (25, 'Xử lý rò rỉ đường ống', 'điểm', 200000),
    (25, 'Lắp thiết bị vệ sinh', 'thiết bị', 250000),
    (26, 'Căn chỉnh cửa bị xệ', 'bộ cửa', 180000),
    (26, 'Thay khóa cửa', 'bộ', 150000),
    (26, 'Thay bản lề cửa', 'cái', 80000),
    (26, 'Thay kính cửa', 'm2', 300000),
    (27, 'Đóng gói đồ đạc', 'giờ công', 120000),
    (27, 'Bốc xếp đồ đạc', 'giờ công', 150000),
    (27, 'Tháo lắp nội thất', 'món', 180000),
    (28, 'Đóng gói hồ sơ và thiết bị', 'giờ công', 150000),
    (28, 'Bốc xếp văn phòng', 'giờ công', 180000),
    (28, 'Tháo lắp bàn ghế văn phòng', 'bộ', 120000)
ON DUPLICATE KEY UPDATE unit = VALUES(unit), labor_price = VALUES(labor_price), active = 1;
