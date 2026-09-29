-- Cập nhật bảng user
ALTER TABLE user ADD COLUMN role ENUM('super_admin', 'admin', 'manager', 'employee', 'user') DEFAULT 'user';

-- Tạo tài khoản quản trị qua seed cục bộ hoặc giao diện quản trị.
-- Không lưu thông tin đăng nhập mặc định trong source control.
