const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await scrypt(password, salt, 64);
    return `scrypt$${salt}$${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
    if (!stored || typeof password !== 'string') return false;
    if (!stored.startsWith('scrypt$')) return password === stored;
    const [, salt, hex] = stored.split('$');
    if (!salt || !hex || hex.length !== 128) return false;
    const actual = await scrypt(password, salt, 64);
    return crypto.timingSafeEqual(actual, Buffer.from(hex, 'hex'));
}

module.exports = { hashPassword, verifyPassword };
