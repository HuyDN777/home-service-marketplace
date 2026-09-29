-- Run after 2026_09_30_no_repair_outcome.sql.
ALTER TABLE partner_wallet_transaction
    MODIFY COLUMN type ENUM(
        'JOB_EARNING',
        'CASH_COLLECTION',
        'CANCELLATION_COMPENSATION',
        'PLATFORM_COMMISSION',
        'WITHDRAWAL',
        'ADJUSTMENT'
    ) NOT NULL;
