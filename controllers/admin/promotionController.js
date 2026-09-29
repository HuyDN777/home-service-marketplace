const Promotion = require('../../models/Promotion');

const promotionController = {
    async getAllPromotions(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const pageSize = parseInt(req.query.pageSize) || 10;
            const offset = (page - 1) * pageSize;
            const coupons = await Promotion.findAll(pageSize, offset);
            const total = await Promotion.totalPromotions();
            const totalPages = Math.ceil(total / pageSize);
            res.render("admin/promotion_management", { coupons, page, totalPages, pageSize, total, user: req.user, token: req.cookies.token });
            //res.json({ data: coupons, total, page, pageSize, totalPages });
        } catch (err) {
            return res.status(401).send('Unauthorized');
        }
    },
    async createPromotion(req, res) {
        try {
            const { code, discount, start_date, end_date } = req.body;
            const normalizedCode = String(code || '').trim().toUpperCase();
            const normalizedDiscount = Number(discount);
            if (!normalizedCode || !Number.isFinite(normalizedDiscount) || normalizedDiscount < 0 || normalizedDiscount > 100) {
                return res.status(400).json({ error: 'Mã hoặc mức giảm giá không hợp lệ' });
            }
            if (!start_date || !end_date || new Date(start_date) > new Date(end_date)) {
                return res.status(400).json({ error: 'Thời gian áp dụng không hợp lệ' });
            }
            if (await Promotion.findByCode(normalizedCode)) {
                return res.status(409).json({ error: 'Mã khuyến mãi đã tồn tại' });
            }
            const promotionData = { code: normalizedCode, discount: normalizedDiscount, start_date, end_date };
            await Promotion.create(promotionData);
            res.json({ message: "Khuyến mãi đã được tạo thành công", promotionData: promotionData });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Lỗi khi tạo khuyến mãi" });
        }
    },
    async deletePromotion(req, res) {
        try {
            const { id } = req.params;
            await Promotion.delete(id);
            res.json({ message: "Khuyến mãi đã được xóa thành công" });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Lỗi khi xóa khuyến mãi" });
        }
    }, 

    async getPromotionAvailable(req, res) {
        const couponsAvailable = await Promotion.findPromotionAvailable();
        res.json({ coupons: couponsAvailable});
    }
};

module.exports = promotionController;
