-- Run after 2026_09_22_offer_dispatch.sql. Existing assigned jobs remain unchanged.
UPDATE `order`
SET Employeeid = NULL, status = 'PENDING', offer_expires_at = NULL
WHERE status = 'OFFERED';

-- Check duplicate usernames before running this statement on existing data.
ALTER TABLE employee ADD UNIQUE KEY uq_employee_username (username);
