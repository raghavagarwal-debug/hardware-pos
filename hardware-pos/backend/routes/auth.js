const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await db.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
    const user = result.rows[0];

    if (!user) return res.status(401).json({ error: 'Invalid username or password' });

    const token = Buffer.from(`${user.username}:${user.role}`).toString('base64');
    res.json({
      token,
      user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.get('/me', requireAuth, (req, res) => {
  const { id, username, display_name, role } = req.user;
  res.json({ user: { id, username, display_name, role } });
});

module.exports = router;
