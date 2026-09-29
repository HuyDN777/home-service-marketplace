-- Run after 2026_09_25_order_expiration.sql.
ALTER TABLE `order`
    MODIFY COLUMN payment_status ENUM(
        'UNPAID',
        'PENDING',
        'PAID',
        'FAILED',
        'PENDING_REFUND',
        'REFUND_FAILED',
        'REFUNDED'
    ) NOT NULL DEFAULT 'UNPAID';

CREATE TABLE payment_transaction (
    id INT AUTO_INCREMENT PRIMARY KEY,
    Orderid INT NOT NULL,
    provider ENUM('VNPAY') NOT NULL DEFAULT 'VNPAY',
    txn_ref VARCHAR(100) NOT NULL,
    provider_transaction_no VARCHAR(100) NULL,
    transaction_date VARCHAR(14) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    bank_code VARCHAR(30) NULL,
    status ENUM('PAID', 'FAILED') NOT NULL DEFAULT 'PAID',
    raw_response JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_payment_provider_txn_ref (provider, txn_ref),
    UNIQUE KEY uq_payment_order (Orderid),
    CONSTRAINT fk_payment_transaction_order FOREIGN KEY (Orderid) REFERENCES `order`(id)
);

CREATE TABLE refund_transaction (
    id INT AUTO_INCREMENT PRIMARY KEY,
    Orderid INT NOT NULL,
    payment_transaction_id INT NOT NULL,
    request_id VARCHAR(100) NOT NULL,
    refund_type ENUM('FULL', 'PARTIAL') NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    status ENUM('CREATED', 'SUBMITTED', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'CREATED',
    provider_response_code VARCHAR(10) NULL,
    provider_transaction_status VARCHAR(10) NULL,
    provider_message VARCHAR(255) NULL,
    raw_response JSON NULL,
    requested_at DATETIME NULL,
    completed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_refund_order (Orderid),
    UNIQUE KEY uq_refund_request (request_id),
    CONSTRAINT fk_refund_order FOREIGN KEY (Orderid) REFERENCES `order`(id),
    CONSTRAINT fk_refund_payment FOREIGN KEY (payment_transaction_id) REFERENCES payment_transaction(id)
);
