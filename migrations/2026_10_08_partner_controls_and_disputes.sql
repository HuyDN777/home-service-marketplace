-- Run after 2026_10_07_payment_reliability.sql.
ALTER TABLE order_rejection
    ADD COLUMN action ENUM('DECLINED', 'CANCELLED') NOT NULL DEFAULT 'DECLINED' AFTER Employeeid,
    ADD COLUMN reason VARCHAR(255) NULL AFTER action;

ALTER TABLE `order`
    MODIFY COLUMN status ENUM(
        'PENDING', 'OFFERED', 'ASSIGNED', 'IN_PROGRESS', 'WORK_DONE',
        'DISPUTED', 'COMPLETED', 'CANCELLED', 'EXPIRED'
    ) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN confirmation_due_at DATETIME NULL AFTER actual_finished_at;

CREATE TABLE order_dispute (
    id INT AUTO_INCREMENT PRIMARY KEY,
    Orderid INT NOT NULL,
    Userid INT NOT NULL,
    reason VARCHAR(500) NOT NULL,
    status ENUM('OPEN', 'RESOLVED_COMPLETE', 'RESOLVED_REWORK') NOT NULL DEFAULT 'OPEN',
    admin_note VARCHAR(500) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME NULL,
    UNIQUE KEY uq_order_dispute (Orderid),
    INDEX idx_dispute_status_created (status, created_at),
    CONSTRAINT fk_dispute_order FOREIGN KEY (Orderid) REFERENCES `order`(id),
    CONSTRAINT fk_dispute_user FOREIGN KEY (Userid) REFERENCES user(id)
);

UPDATE `order`
SET confirmation_due_at = DATE_ADD(COALESCE(actual_finished_at, NOW()), INTERVAL 24 HOUR)
WHERE status = 'WORK_DONE' AND confirmation_due_at IS NULL;
