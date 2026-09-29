-- Run after 2026_10_05_schema_consistency.sql.
CREATE TABLE customer_debt_payment (
    id INT AUTO_INCREMENT PRIMARY KEY,
    Userid INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    status ENUM('PENDING', 'PAID', 'FAILED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    txn_ref VARCHAR(100) NULL,
    provider_transaction_no VARCHAR(100) NULL,
    bank_code VARCHAR(30) NULL,
    raw_response JSON NULL,
    expires_at DATETIME NOT NULL,
    paid_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_debt_payment_txn_ref (txn_ref),
    INDEX idx_debt_payment_user_status (Userid, status),
    CONSTRAINT fk_debt_payment_user FOREIGN KEY (Userid) REFERENCES user(id)
);

CREATE TABLE customer_debt_payment_item (
    payment_id INT NOT NULL,
    debt_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    PRIMARY KEY (payment_id, debt_id),
    INDEX idx_debt_payment_item_debt (debt_id),
    CONSTRAINT fk_debt_payment_item_payment FOREIGN KEY (payment_id) REFERENCES customer_debt_payment(id) ON DELETE CASCADE,
    CONSTRAINT fk_debt_payment_item_debt FOREIGN KEY (debt_id) REFERENCES customer_debt(id)
);
