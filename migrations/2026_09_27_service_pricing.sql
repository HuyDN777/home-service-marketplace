SET @add_pricing_model = IF(
    EXISTS(
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service' AND COLUMN_NAME = 'pricing_model'
    ),
    'SELECT 1',
    "ALTER TABLE service ADD COLUMN pricing_model ENUM('HOURLY', 'PER_UNIT', 'FIXED', 'INSPECTION') NOT NULL DEFAULT 'FIXED' AFTER unit"
);
PREPARE pricing_stmt FROM @add_pricing_model;
EXECUTE pricing_stmt;
DEALLOCATE PREPARE pricing_stmt;

SET @add_default_duration = IF(
    EXISTS(
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service' AND COLUMN_NAME = 'default_duration_minutes'
    ),
    'SELECT 1',
    'ALTER TABLE service ADD COLUMN default_duration_minutes INT NOT NULL DEFAULT 120 AFTER pricing_model'
);
PREPARE duration_stmt FROM @add_default_duration;
EXECUTE duration_stmt;
DEALLOCATE PREPARE duration_stmt;

UPDATE service SET pricing_model = 'HOURLY', unit = 'giờ', default_duration_minutes = 120 WHERE id = 23;
UPDATE service SET pricing_model = 'INSPECTION', unit = 'lần khảo sát', default_duration_minutes = 60 WHERE id IN (24, 25, 26);
UPDATE service SET pricing_model = 'INSPECTION', unit = 'lần khảo sát', default_duration_minutes = 60 WHERE id IN (27, 28);
UPDATE service SET pricing_model = 'PER_UNIT', unit = 'cây', default_duration_minutes = 120 WHERE id IN (30, 31);
