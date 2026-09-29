# Don Nha Vui

Web ket noi khach hang va cong tac vien (CTV) don nha. Bang `employee` va role `employee` la ten cu trong database/API, hien dai dien cho CTV.

## Chay local

1. `npm install`.
2. Tao MySQL database va cac bang nen cua project. `database.sql` khong phai full schema.
3. Trong DBeaver, chon dung schema va chay theo thu tu: `migrations/2026_09_08_order_workflow.sql`, `migrations/2026_09_22_offer_dispatch.sql`, `migrations/2026_09_23_partner_marketplace.sql`. Dung Execute SQL Script (Alt+X). Khong chay lai cac migration da ap dung. Truoc migration thu ba, kiem tra trung username bang `SELECT username, COUNT(*) FROM employee GROUP BY username HAVING COUNT(*) > 1`.
4. Cau hinh database va bien moi truong, sau do `npm start`. Web mac dinh o `http://localhost:3000`.

## Luong CTV

- CTV dang ky tai `/employee/register`, admin duyet/tam khoa tai `/admin/employees`.
- Don moi o `PENDING` la viec mo. CTV da duyet, dung dich vu, khong trung lich xem duoc viec tai `/employee` va tu nhan ca.
- Claim duoc khoa trong transaction: moi don chi mot CTV nhan, mot CTV khong the nhan hai ca trung gio.
- Nhan ca -> `ASSIGNED`, bat dau -> `IN_PROGRESS`, ket thuc -> `WORK_DONE`, khach xac nhan -> `COMPLETED`.
- Migration thu ba tra cac offer cu ve `PENDING`; don da nhan duoc giu nguyen. Cot offer/rejection cu chua bi xoa de tranh mat du lieu.

## Gioi han

Can kiem tra thuc te voi database cua ban truoc khi dua len production. Chua co xac minh danh tinh CTV, thanh toan/doi soat cho CTV, thong bao real-time va full database schema. Tai khoan CTV cu dung mat khau plaintext duoc ho tro de dang nhap, nhung can doi mat khau de chuyen sang scrypt.
