-- Run after 2026_10_04_material_off_platform.sql.
ALTER TABLE `order`
    MODIFY COLUMN status ENUM(
        'PENDING',
        'OFFERED',
        'ASSIGNED',
        'IN_PROGRESS',
        'WORK_DONE',
        'COMPLETED',
        'CANCELLED',
        'EXPIRED'
    ) NOT NULL DEFAULT 'PENDING';

ALTER TABLE feedback
    MODIFY COLUMN comment VARCHAR(500) NULL;

ALTER TABLE service
    MODIFY COLUMN price DECIMAL(12,2) NOT NULL;

ALTER TABLE bill
    MODIFY COLUMN amount DECIMAL(12,2) NULL;

ALTER TABLE temp_order
    MODIFY COLUMN final_price DECIMAL(12,2) NULL;

ALTER TABLE repair_catalog_item
    MODIFY COLUMN unit VARCHAR(50) NOT NULL DEFAULT 'lần';

ALTER TABLE service_quote_item
    MODIFY COLUMN unit VARCHAR(50) NOT NULL DEFAULT 'lần';
