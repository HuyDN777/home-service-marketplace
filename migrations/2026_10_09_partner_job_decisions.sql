-- Run after 2026_10_08_partner_controls_and_disputes.sql.
CREATE TABLE partner_job_decision (
    id INT AUTO_INCREMENT PRIMARY KEY,
    Orderid INT NOT NULL,
    Employeeid INT NOT NULL,
    decision ENUM('ACCEPTED', 'DECLINED', 'CANCELLED') NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_partner_job_decision (Orderid, Employeeid, decision),
    INDEX idx_partner_decision_period (Employeeid, created_at, decision),
    CONSTRAINT fk_partner_decision_order FOREIGN KEY (Orderid) REFERENCES `order`(id),
    CONSTRAINT fk_partner_decision_employee FOREIGN KEY (Employeeid) REFERENCES employee(id)
);

INSERT IGNORE INTO partner_job_decision (Orderid, Employeeid, decision, created_at)
SELECT Orderid, Employeeid,
       CASE action WHEN 'CANCELLED' THEN 'CANCELLED' ELSE 'DECLINED' END,
       rejected_at
FROM order_rejection;
