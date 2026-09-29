UPDATE `order` SET status = 'PENDING' WHERE status IS NULL OR status = '';

ALTER TABLE `order`
    MODIFY COLUMN status VARCHAR(50) NOT NULL DEFAULT 'PENDING';

UPDATE `order`
SET status = CASE LOWER(status)
    WHEN 'pending' THEN 'PENDING'
    WHEN 'in_progress' THEN 'IN_PROGRESS'
    WHEN 'completed' THEN 'COMPLETED'
    WHEN 'cancelled' THEN 'CANCELLED'
    ELSE status
END;

UPDATE `order`
SET status = 'ASSIGNED'
WHERE status = 'IN_PROGRESS'
    AND Employeeid IS NOT NULL;

UPDATE `order`
SET status = 'PENDING'
WHERE status = 'IN_PROGRESS'
    AND Employeeid IS NULL;

ALTER TABLE `order`
    MODIFY COLUMN status ENUM(
        'PENDING',
        'OFFERED',
        'ASSIGNED',
        'IN_PROGRESS',
        'WORK_DONE',
        'COMPLETED',
        'CANCELLED'
    ) NOT NULL DEFAULT 'PENDING';

ALTER TABLE `order`
    ADD COLUMN start_datetime DATETIME NULL AFTER implementing_date,
    ADD COLUMN end_datetime DATETIME NULL AFTER start_datetime,
    ADD COLUMN payment_status ENUM('UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'UNPAID' AFTER status;

UPDATE `order`
SET start_datetime = COALESCE(start_datetime, TIMESTAMP(COALESCE(implementing_date, booking_date, CURDATE()), '08:00:00')),
    end_datetime = COALESCE(end_datetime, TIMESTAMP(COALESCE(implementing_date, booking_date, CURDATE()), '10:00:00'));

ALTER TABLE `order`
    MODIFY COLUMN start_datetime DATETIME NOT NULL,
    MODIFY COLUMN end_datetime DATETIME NOT NULL;

ALTER TABLE temp_order
    ADD COLUMN start_datetime DATETIME NULL AFTER implementing_date,
    ADD COLUMN end_datetime DATETIME NULL AFTER start_datetime;

ALTER TABLE employee
    ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS order_rejection (
    id INT AUTO_INCREMENT PRIMARY KEY,
    Orderid INT NOT NULL,
    Employeeid INT NOT NULL,
    rejected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_order_employee_rejection (Orderid, Employeeid),
    CONSTRAINT fk_order_rejection_order FOREIGN KEY (Orderid) REFERENCES `order`(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_rejection_employee FOREIGN KEY (Employeeid) REFERENCES employee(id) ON DELETE CASCADE
);
