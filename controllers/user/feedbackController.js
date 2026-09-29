const db = require('../../config/database');

const feedbackController = {
    async sendFeedback(req, res) {
        try {
            const userId = req.user.id;
            const { order_id, rating, comment } = req.body;
            const normalizedRating = Number(rating);
            const normalizedComment = String(comment || '').trim();
            if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
                return res.status(400).json({ error: "Vui lòng chọn từ 1 đến 5 sao." });
            }
            if (!normalizedComment || normalizedComment.length > 500) {
                return res.status(400).json({ error: "Nhận xét phải có từ 1 đến 500 ký tự." });
            }
            // Kiểm tra đơn hàng có thuộc về user và đã hoàn thành chưa
            const [orders] = await db.query("SELECT * FROM `order` WHERE id = ? AND Userid = ? AND UPPER(status) = 'COMPLETED'", [order_id, userId]);
            if (orders.length === 0) {
                return res.status(400).json({ error: "Bạn chỉ có thể đánh giá đơn đã hoàn thành của mình." });
            }
            // Kiểm tra đã feedback chưa
            const [fb] = await db.query("SELECT * FROM feedback WHERE Orderid = ?", [order_id]);
            if (fb.length > 0) {
                return res.status(400).json({ error: "Bạn đã đánh giá đơn này rồi." });
            }
            // Thêm feedback
            await db.query(
                "INSERT INTO feedback (Userid, Orderid, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)",
                [userId, order_id, normalizedRating, normalizedComment, new Date()]
            );
            res.json({ message: "Cảm ơn bạn đã đánh giá dịch vụ!", order_id: order_id, rating: normalizedRating, comment: normalizedComment });
        } catch (err) {
            res.status(500).json({ error: "Lỗi khi gửi feedback" });
        }
    }
}

module.exports = feedbackController;
