const pg = require('pg');
const { Pool } = pg;
require('dotenv').config();
const bcrypt = require('bcryptjs');

// Parse PostgreSQL NUMERIC/DECIMAL (OID 1700) as float in JavaScript
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => value === null ? null : parseFloat(value));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Raghav@2008@localhost:5432/hardware_pos'
});

const db = {
  isPostgres: true,
  pool,
  query: (text, params) => pool.query(text, params),

  exec: async (sql) => {
    const client = await pool.connect();
    try {
      await client.query(sql);
    } finally {
      client.release();
    }
  },

  // Transaction helper that wraps a function callback inside BEGIN/COMMIT/ROLLBACK.
  // Receives a pg client to ensure queries in the block run on the same connection.
  transaction: (fn) => async (...args) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client, ...args);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
};

console.log("Database initialized using PostgreSQL configuration.");

// Initialize Database Schema and Seeding
(async () => {
  try {
    // 1. Create tenants table and sync sequence
    await db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address VARCHAR(255) DEFAULT '',
        phone VARCHAR(50) DEFAULT '',
        gstin VARCHAR(50) DEFAULT '',
        gst_rate DECIMAL(5,2) DEFAULT 0,
        low_stock_threshold INTEGER DEFAULT 10,
        print_format VARCHAR(50) DEFAULT '80mm',
        whatsapp_template TEXT DEFAULT 'Dear {customer_name},\n\nThank you for shopping with us! Here are your bill details:\nTotal Amount: ₹{total_amount}\nAmount Paid: ₹{amount_paid}\nDue: ₹{due_amount}\n\nHave a great day!',
        theme VARCHAR(50) DEFAULT 'default',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    await db.query(`
      INSERT INTO tenants (id, name)
      SELECT 1, 'Default Store'
      WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE id = 1);
    `);
    
    await db.query(`
      SELECT setval(pg_get_serial_sequence('tenants', 'id'), COALESCE(MAX(id), 1)) FROM tenants;
    `);

    // 2. Migrate existing tables to include tenant_id
    const tablesToMigrate = [
      'users',
      'products',
      'price_history',
      'inventory_transactions',
      'invoices',
      'customers',
      'payments'
    ];

    for (const tbl of tablesToMigrate) {
      await db.exec(`
        ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE;
      `);
      await db.query(`
        UPDATE ${tbl} SET tenant_id = 1 WHERE tenant_id IS NULL;
      `);
      await db.exec(`
        ALTER TABLE ${tbl} ALTER COLUMN tenant_id SET NOT NULL;
      `);
    }

    // Drop payments foreign key first since it depends on the customers phone unique key
    await db.exec(`
      ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_customer_phone_fkey;
      ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_tenant_id_customer_phone_fkey;
    `);

    // Drop global unique constraint on customer phone and set composite unique constraint
    await db.exec(`
      ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_phone_key;
      ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_tenant_id_phone_key;
      ALTER TABLE customers ADD CONSTRAINT customers_tenant_id_phone_key UNIQUE (tenant_id, phone);
    `);

    // Migrate payments foreign key to point to composite tenant_id, phone constraint
    await db.exec(`
      ALTER TABLE payments ADD CONSTRAINT payments_tenant_id_customer_phone_fkey FOREIGN KEY (tenant_id, customer_phone) REFERENCES customers(tenant_id, phone) ON UPDATE CASCADE ON DELETE CASCADE;
    `);

    // Add invoice_number column to invoices if not exists and populate it
    await db.exec(`
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100);
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 0;
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS gst_amount DECIMAL(12,2) DEFAULT 0;
    `);

    const nullInvoices = await db.query('SELECT id, tenant_id, created_at FROM invoices WHERE invoice_number IS NULL ORDER BY tenant_id, created_at ASC, id ASC');
    let currentTenantId = null;
    let idx = 1;
    for (const inv of nullInvoices.rows) {
      if (inv.tenant_id !== currentTenantId) {
        currentTenantId = inv.tenant_id;
        idx = 1;
      }
      const invNum = `INV-${String(idx++).padStart(5, '0')}`;
      await db.query('UPDATE invoices SET invoice_number = $1 WHERE id = $2', [invNum, inv.id]);
    }

    await db.exec(`
      ALTER TABLE invoices ALTER COLUMN invoice_number SET NOT NULL;
      ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;
    `);

    try {
      await db.exec(`
        ALTER TABLE invoices ADD CONSTRAINT invoices_tenant_id_invoice_number_key UNIQUE (tenant_id, invoice_number);
      `);
    } catch (e) {
      // Ignore if constraint already exists
    }

    // 3. Re-create / verify schema tables and indexes with tenant_id constraints
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('owner','worker','worker1','worker2'))
      );

      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) DEFAULT '',
        unit VARCHAR(50) DEFAULT 'pcs',
        current_selling_price DECIMAL(12,2) NOT NULL DEFAULT 0,
        market_price DECIMAL(12,2) NOT NULL DEFAULT 0,
        dealer_price DECIMAL(12,2),
        last_selling_price DECIMAL(12,2),
        previous_selling_price DECIMAL(12,2),
        last_updated_date TIMESTAMP WITH TIME ZONE,
        last_updated_by VARCHAR(100),
        current_stock INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS price_history (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id),
        product_name VARCHAR(255) NOT NULL,
        field_changed VARCHAR(50) NOT NULL,
        old_price DECIMAL(12,2),
        new_price DECIMAL(12,2),
        old_market_price DECIMAL(12,2),
        new_market_price DECIMAL(12,2),
        updated_by VARCHAR(100) NOT NULL,
        reason TEXT DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS inventory_transactions (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id),
        product_name VARCHAR(255) NOT NULL,
        transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN (
          'New Stock Purchase','Sale','Customer Return','Supplier Return',
          'Manual Stock Adjustment','Damaged Item','Lost Item',
          'Stock Correction','Opening Stock Entry'
        )),
        quantity INTEGER NOT NULL,
        previous_stock INTEGER NOT NULL,
        updated_stock INTEGER NOT NULL,
        performed_by VARCHAR(100) NOT NULL,
        remarks TEXT DEFAULT '',
        supplier VARCHAR(255) DEFAULT '',
        invoice_number VARCHAR(100) DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        invoice_number VARCHAR(100) UNIQUE NOT NULL,
        customer_name VARCHAR(255) DEFAULT 'Walk-in Customer',
        customer_phone VARCHAR(50) DEFAULT '',
        created_by VARCHAR(100) NOT NULL,
        total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
        payment_status VARCHAR(50) DEFAULT 'Paid' CHECK (payment_status IN ('Paid','Due')),
        gst_rate DECIMAL(5,2) DEFAULT 0,
        gst_amount DECIMAL(12,2) DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS invoice_items (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER NOT NULL REFERENCES invoices(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        product_name VARCHAR(255) NOT NULL,
        quantity INTEGER NOT NULL,
        selling_price DECIMAL(12,2) NOT NULL,
        line_total DECIMAL(12,2) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        notes TEXT DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        customer_phone VARCHAR(50) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        remarks TEXT DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id);
      CREATE INDEX IF NOT EXISTS idx_inv_txn_product ON inventory_transactions(product_id);
      CREATE INDEX IF NOT EXISTS idx_inv_txn_type ON inventory_transactions(transaction_type);
      CREATE INDEX IF NOT EXISTS idx_inv_txn_date ON inventory_transactions(created_at);
    `);

    // 4. Seed Users if empty, using hashed passwords
    const userRes = await db.query('SELECT COUNT(*) AS c FROM users');
    if (parseInt(userRes.rows[0].c, 10) === 0) {
      const ownerHash = await bcrypt.hash('owner@123', 10);
      const owner1Hash = await bcrypt.hash('owner1@123', 10);
      const workerHash = await bcrypt.hash('worker@123', 10);
      await db.query(`
        INSERT INTO users (tenant_id, username, password, display_name, role) VALUES 
        (1, 'owner', $1, 'Raghav (Owner)', 'owner'),
        (1, 'owner1', $2, 'Owner1 (Owner)', 'owner'),
        (1, 'worker', $3, 'worker (Worker)', 'worker')
      `, [ownerHash, owner1Hash, workerHash]);
    }

    // 5. Migrate existing users to hashed passwords if they are plain text
    const allUsers = await db.query('SELECT id, password FROM users');
    for (const u of allUsers.rows) {
      if (!u.password.startsWith('$2a$') && !u.password.startsWith('$2b$')) {
        const hashed = await bcrypt.hash(u.password, 10);
        await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, u.id]);
      }
    }

    // 6. Seed Products if empty
    const prodRes = await db.query('SELECT COUNT(*) AS c FROM products');
    if (parseInt(prodRes.rows[0].c, 10) === 0) {
      const now = new Date().toISOString();
      const seedProducts = [
        { name: 'Hex Bolt M8x50 (100pc box)', unit: 'box', current_selling_price: 300, last_selling_price: null, previous_selling_price: null, last_updated_date: now, last_updated_by: 'owner' },
        { name: 'PVC Pipe 1 inch (10ft)', unit: 'pcs', current_selling_price: 190, last_selling_price: null, previous_selling_price: null, last_updated_date: now, last_updated_by: 'owner' },
        { name: 'Copper Wire 1.5mm (90m coil)', unit: 'coil', current_selling_price: 1750, last_selling_price: null, previous_selling_price: null, last_updated_date: now, last_updated_by: 'owner' },
        { name: 'Cement 50kg Bag', unit: 'bag', current_selling_price: 390, last_selling_price: null, previous_selling_price: null, last_updated_date: now, last_updated_by: 'owner' },
      ];
      const openingQty = { 'Hex Bolt M8x50 (100pc box)': 40, 'PVC Pipe 1 inch (10ft)': 60, 'Copper Wire 1.5mm (90m coil)': 15, 'Cement 50kg Bag': 100 };

      const seedAll = db.transaction(async (client) => {
        for (const row of seedProducts) {
          const qty = openingQty[row.name] || 0;
          const res = await client.query(`
            INSERT INTO products
              (tenant_id, name, unit, current_selling_price, last_selling_price, previous_selling_price,
               last_updated_date, last_updated_by, current_stock)
            VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
          `, [
            row.name, row.unit, row.current_selling_price, row.last_selling_price, row.previous_selling_price,
            row.last_updated_date, row.last_updated_by, qty
          ]);
          const newId = res.rows[0].id;
          await client.query(`
            INSERT INTO inventory_transactions
              (tenant_id, product_id, product_name, transaction_type, quantity, previous_stock, updated_stock, performed_by, remarks)
            VALUES (1, $1, $2, 'Opening Stock Entry', $3, 0, $4, 'owner', 'Initial opening stock at system setup')
          `, [newId, row.name, qty, qty]);
        }
      });
      await seedAll();
    }

    console.log("PostgreSQL schema synchronized and seed data verified.");
  } catch (err) {
    console.error("Failed to automatically synchronize PostgreSQL schema or seed data:", err);
  }
})();

module.exports = db;
