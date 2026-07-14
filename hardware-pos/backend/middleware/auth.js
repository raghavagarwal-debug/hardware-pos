const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET_ENV = process.env.JWT_SECRET;
if (!JWT_SECRET_ENV) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is not defined! Setup JWT_SECRET in your environment for deployment.');
  } else {
    console.warn('WARNING: JWT_SECRET is not defined. Using a default temporary key.');
  }
}
const JWT_SECRET = JWT_SECRET_ENV || 'hardware_pos_jwt_secret_key_123';

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || !decoded.userId || !decoded.username) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const result = await db.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid session' });

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    return res.status(500).json({ error: 'Database error' });
  }
}

function requireOwner(req, res, next) {
  if (!req.user || req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Only the Owner can perform this action' });
  }
  next();
}

module.exports = { requireAuth, requireOwner, JWT_SECRET };
