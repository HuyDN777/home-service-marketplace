-- Run after 2026_09_23_partner_marketplace.sql.
ALTER TABLE `order`
    ADD COLUMN payment_method ENUM('CASH', 'ONLINE') NOT NULL DEFAULT 'CASH' AFTER payment_status,
    ADD COLUMN final_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER payment_method,
    ADD COLUMN cancelled_by ENUM('CUSTOMER', 'PARTNER', 'ADMIN', 'SYSTEM') NULL AFTER final_amount,
    ADD COLUMN cancellation_reason VARCHAR(255) NULL AFTER cancelled_by,
    ADD COLUMN cancelled_at DATETIME NULL AFTER cancellation_reason;

UPDATE `order` o
LEFT JOIN bill b ON b.Orderid = o.id
SET o.final_amount = COALESCE(b.amount, 0),
    o.payment_method = CASE WHEN o.payment_status = 'PAID' THEN 'ONLINE' ELSE 'CASH' END
WHERE o.final_amount = 0;

ALTER TABLE employee
    ADD COLUMN partner_balance DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER accepting_jobs;

CREATE TABLE customer_debt (
    id INT AUTO_INCREMENT PRIMARY KEY,
    Userid INT NOT NULL,
    Orderid INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    status ENUM('UNPAID', 'PAID', 'WAIVED') NOT NULL DEFAULT 'UNPAID',
    reason VARCHAR(50) NOT NULL DEFAULT 'LATE_CANCELLATION',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at DATETIME NULL,
    UNIQUE KEY uq_customer_debt_order (Orderid),
    INDEX idx_customer_debt_user_status (Userid, status),
    CONSTRAINT fk_customer_debt_user FOREIGN KEY (Userid) REFERENCES user(id),
    CONSTRAINT fk_customer_debt_order FOREIGN KEY (Orderid) REFERENCES `order`(id)
);

CREATE TABLE partner_wallet_transaction (
    id INT AUTO_INCREMENT PRIMARY KEY,
    Employeeid INT NOT NULL,
    Orderid INT NULL,
    type ENUM('JOB_EARNING', 'CANCELLATION_COMPENSATION', 'PLATFORM_COMMISSION', 'WITHDRAWAL', 'ADJUSTMENT') NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    balance_after DECIMAL(12,2) NOT NULL,
    description VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_partner_order_transaction (Employeeid, Orderid, type),
    INDEX idx_partner_wallet_created (Employeeid, created_at),
    CONSTRAINT fk_wallet_employee FOREIGN KEY (Employeeid) REFERENCES employee(id),
    CONSTRAINT fk_wallet_order FOREIGN KEY (Orderid) REFERENCES `order`(id)
);

CREATE TABLE order_cancellation (
    id INT AUTO_INCREMENT PRIMARY KEY,
    Orderid INT NOT NULL,
    cancelled_by ENUM('CUSTOMER', 'PARTNER', 'ADMIN', 'SYSTEM') NOT NULL,
    reason VARCHAR(255) NULL,
    fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    partner_compensation DECIMAL(12,2) NOT NULL DEFAULT 0,
    platform_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    fee_status ENUM('NOT_APPLICABLE', 'UNPAID', 'COLLECTED', 'WAIVED') NOT NULL DEFAULT 'NOT_APPLICABLE',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_order_cancellation (Orderid),
    CONSTRAINT fk_cancellation_order FOREIGN KEY (Orderid) REFERENCES `order`(id)
);
