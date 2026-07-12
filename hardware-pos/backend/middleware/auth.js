const db = require('../db');
function decodeToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [username, role] = decoded.split(':');
    if (!username || !role) return null;
    return { username, role };
  } catch {
    return null;
  }
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  const decoded = decodeToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid session' });

  try {
    const result = await db.query('SELECT * FROM users WHERE username = $1 AND role = $2', [decoded.username, decoded.role]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid session' });

    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Database error' });
  }
}

function requireOwner(req, res, next) {
  if (!req.user || req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Only the Owner can perform this action' });
  }
  next();
}

module.exports = { requireAuth, requireOwner };
