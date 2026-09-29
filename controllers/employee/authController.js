const jwt = require('jsonwebtoken');
const db = require('../../config/database');
const Service = require('../../models/Service');
const { hashPassword, verifyPassword } = require('../../services/partnerPassword');

module.exports = {
    async registerPage(req, res) {
        try { res.render('employee/register', { services: await Service.getName() }); }
        catch (error) { res.status(500).send('Khong tai duoc trang dang ky'); }
    },
    async register(req, res) {
        const { name, username, password, email, phone, Serviceid } = req.body;
        if (![name, username, email, phone].every(value => typeof value === 'string' && value.trim()) ||
            typeof password !== 'string' || password.length < 8 || !Number.isSafeInteger(Number(Serviceid))) {
            return res.status(400).json({ error: 'Thong tin dang ky khong hop le; mat khau can it nhat 8 ky tu.' });
        }
        try {
            const [services] = await db.query('SELECT id FROM service WHERE id = ?', [Serviceid]);
            if (!services.length) return res.status(400).json({ error: 'Dich vu khong ton tai.' });
            await db.query(`INSERT INTO employee
                (name, username, password, email, phone, Serviceid, experience, active)
                VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
                [name.trim(), username.trim(), await hashPassword(password), email.trim(), phone.trim(), Serviceid]);
            res.status(201).json({ message: 'Dang ky thanh cong. Vui long cho quan tri vien duyet tai khoan.' });
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ten dang nhap da ton tai.' });
            console.error(error);
            res.status(500).json({ error: 'Khong the dang ky luc nay.' });
        }
    },
    async login(req, res) {
        const { username, password } = req.body;
        try {
            const [rows] = await db.query('SELECT * FROM employee WHERE username = ?', [username]);
            const employee = rows[0];
            if (!employee || !await verifyPassword(password, employee.password)) {
                return res.status(401).json({ error: 'Sai tai khoan hoac mat khau.' });
            }
            if (!employee.active) return res.status(403).json({ error: 'Tai khoan CTV chua duoc duyet hoac da tam khoa.' });
            const token = jwt.sign({ id: employee.id, role: 'employee', name: employee.name },
                process.env.ACCESS_SECRET_KEY, { expiresIn: '8h' });
            res.cookie('employee_token', token, { httpOnly: true, sameSite: 'lax', path: '/employee', maxAge: 8 * 60 * 60 * 1000 });
            res.json({ employee: { id: employee.id, name: employee.name } });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Loi may chu.' });
        }
    }
};
