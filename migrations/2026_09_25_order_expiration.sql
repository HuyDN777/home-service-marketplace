-- Run after 2026_09_24_cancellation_finance.sql.
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
    ) NOT NULL DEFAULT 'PENDING',
    MODIFY COLUMN payment_status ENUM(
        'UNPAID',
        'PENDING',
        'PAID',
        'FAILED',
        'PENDING_REFUND',
        'REFUNDED'
    ) NOT NULL DEFAULT 'UNPAID';

CREATE INDEX idx_order_matching_deadline ON `order` (status, start_datetime);
