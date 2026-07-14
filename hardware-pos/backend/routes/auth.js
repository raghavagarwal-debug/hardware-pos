const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register - Register new store tenant & owner user
router.post('/register', async (req, res) => {
  const { storeName, username, password, displayName } = req.body;
  if (!storeName || !username || !password || !displayName) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // Check if user already exists globally
    const userExists = await db.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    // Run tenant and user creation in transaction
    const registerTxn = db.transaction(async (client) => {
      // 1. Create Tenant
      const tenantRes = await client.query(
        'INSERT INTO tenants (name) VALUES ($1) RETURNING *',
        [storeName]
      );
      const tenant = tenantRes.rows[0];

      // 2. Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // 3. Create User (Owner)
      const userRes = await client.query(
        `INSERT INTO users (tenant_id, username, password, display_name, role)
         VALUES ($1, $2, $3, $4, 'owner') RETURNING id, username, display_name, role`,
        [tenant.id, username, hashedPassword, displayName]
      );
      const user = userRes.rows[0];

      return { tenant, user };
    });

    const { tenant, user } = await registerTxn();

    // Sign JWT
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role, tenantId: tenant.id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      token,
      user,
      tenant
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login - Login existing user
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];

    if (!user) return res.status(401).json({ error: 'Invalid username or password' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid username or password' });

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role, tenantId: user.tenant_id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    const tenantRes = await db.query('SELECT * FROM tenants WHERE id = $1', [user.tenant_id]);
    res.json({
      token,
      user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role },
      tenant: tenantRes.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me - Get current logged in user details and tenant profile
router.get('/me', requireAuth, async (req, res) => {
  const { id, username, display_name, role, tenant_id } = req.user;
  try {
    const tenantRes = await db.query('SELECT * FROM tenants WHERE id = $1', [tenant_id]);
    const tenant = tenantRes.rows[0];
    res.json({
      user: { id, username, display_name, role },
      tenant
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve tenant details' });
  }
});

// GET /api/auth/users - List staff members for tenant (Owner only)
router.get('/users', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only the store Owner can view staff members' });
    }
    const result = await db.query(
      'SELECT id, username, display_name, role FROM users WHERE tenant_id = $1 AND role != \'owner\' ORDER BY username',
      [req.user.tenant_id]
    );
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/users - Create a new staff member (Owner only)
router.post('/users', requireAuth, async (req, res) => {
  const { username, password, displayName, role } = req.body;
  if (!username || !password || !displayName || !role) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (!['worker', 'worker1', 'worker2'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only the store Owner can add staff members' });
    }

    // Check username globally
    const exists = await db.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (exists.rows.length > 0) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO users (tenant_id, username, password, display_name, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, username, display_name, role`,
      [req.user.tenant_id, username, hashedPassword, displayName, role]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/users/:id - Delete a staff member (Owner only)
router.delete('/users/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only the store Owner can remove staff members' });
    }

    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete yourself' });
    }

    const check = await db.query('SELECT tenant_id FROM users WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (check.rows[0].tenant_id !== req.user.tenant_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await db.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/tenant-settings - Update store configurations (Owner only)
router.put('/tenant-settings', requireAuth, async (req, res) => {
  const {
    name, address, phone, gstin, gst_rate, low_stock_threshold, print_format, whatsapp_template, theme
  } = req.body;

  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only the store Owner can edit settings' });
    }

    const result = await db.query(
      `UPDATE tenants
       SET name = $1, address = $2, phone = $3, gstin = $4, gst_rate = $5,
           low_stock_threshold = $6, print_format = $7, whatsapp_template = $8, theme = $9
       WHERE id = $10
       RETURNING *`,
      [
        name, address, phone, gstin, Number(gst_rate), parseInt(low_stock_threshold, 10),
        print_format, whatsapp_template, theme, req.user.tenant_id
      ]
    );

    res.json({ tenant: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
