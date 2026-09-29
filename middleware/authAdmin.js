const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

function authenticateToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1] || req.cookies?.token;
    const isPage = req.method === 'GET' && !req.path.startsWith('/statistics/');
    const loginUrl = `/login?next=${encodeURIComponent(req.originalUrl)}`;
    if (!token) return isPage ? res.redirect(loginUrl) : res.status(401).send('Unauthorized');
    
    jwt.verify(token, process.env.ACCESS_SECRET_KEY, (err, user) => {
        if (err) {
            if (isPage) {
                res.clearCookie('token');
                return res.redirect(loginUrl);
            }
            return res.status(401).send('Unauthorized');
        }
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            return isPage ? res.redirect(`${loginUrl}&admin=1`) : res.status(403).send('Forbidden');
        }
        req.user = user;
        next();
    });
}

module.exports = authenticateToken;
