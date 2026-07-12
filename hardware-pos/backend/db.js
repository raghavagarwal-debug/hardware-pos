const pg = require('pg');
const { Pool } = pg;
require('dotenv').config();

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
    // 1. Create PostgreSQL schema tables and indexes
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('owner','worker1','worker2'))
      );

      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
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
        invoice_number VARCHAR(100) UNIQUE NOT NULL,
        customer_name VARCHAR(255) DEFAULT 'Walk-in Customer',
        customer_phone VARCHAR(50) DEFAULT '',
        created_by VARCHAR(100) NOT NULL,
        total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
        payment_status VARCHAR(50) DEFAULT 'Paid' CHECK (payment_status IN ('Paid','Due')),
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
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) UNIQUE NOT NULL,
        notes TEXT DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        customer_phone VARCHAR(50) NOT NULL REFERENCES customers(phone) ON UPDATE CASCADE ON DELETE CASCADE,
        amount DECIMAL(12,2) NOT NULL,
        remarks TEXT DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id);
      CREATE INDEX IF NOT EXISTS idx_inv_txn_product ON inventory_transactions(product_id);
      CREATE INDEX IF NOT EXISTS idx_inv_txn_type ON inventory_transactions(transaction_type);
      CREATE INDEX IF NOT EXISTS idx_inv_txn_date ON inventory_transactions(created_at);
    `);

    // 2. Seed Users if empty
    const userRes = await db.query('SELECT COUNT(*) AS c FROM users');
    if (parseInt(userRes.rows[0].c, 10) === 0) {
      await db.query(`
        INSERT INTO users (username, password, display_name, role) VALUES 
        ('owner', 'owner@123', 'Raghav (Owner)', 'owner'),
        ('owner1', 'owner1@123', 'Owner1 (Owner)', 'owner'),
        ('worker', 'worker@123', 'worker (Worker)', 'worker')
      `);
    }

    // 3. Seed Products and create initial stock transaction records if empty
    const prodRes = await db.query('SELECT COUNT(*) AS c FROM products');
    if (parseInt(prodRes.rows[0].c, 10) === 0) {
      const now = new Date().toISOString();
      // const seedProducts = [
      //   { name: 'Hex Bolt M8x50 (100pc box)', unit: 'box', purchase_price: 220, current_selling_price: 300, last_selling_price: null, previous_selling_price: null, last_updated_date: now, last_updated_by: 'owner' },
      //   { name: 'PVC Pipe 1 inch (10ft)', unit: 'pcs', purchase_price: 140, current_selling_price: 190, last_selling_price: null, previous_selling_price: null, last_updated_date: now, last_updated_by: 'owner' },
      //   { name: 'Copper Wire 1.5mm (90m coil)', unit: 'coil', purchase_price: 1450, current_selling_price: 1750, last_selling_price: null, previous_selling_price: null, last_updated_date: now, last_updated_by: 'owner' },
      //   { name: 'Cement 50kg Bag', unit: 'bag', purchase_price: 340, current_selling_price: 390, last_selling_price: null, previous_selling_price: null, last_updated_date: now, last_updated_by: 'owner' },
      // ];
      // const openingQty = { 'Hex Bolt M8x50 (100pc box)': 40, 'PVC Pipe 1 inch (10ft)': 60, 'Copper Wire 1.5mm (90m coil)': 15, 'Cement 50kg Bag': 100 };

      const seedAll = db.transaction(async (client) => {
        for (const row of seedProducts) {
          const qty = openingQty[row.name] || 0;
          const res = await client.query(`
            INSERT INTO products
              (name, unit, current_selling_price, last_selling_price, previous_selling_price,
               last_updated_date, last_updated_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id
          `, [
            row.name, row.unit, row.current_selling_price, row.last_selling_price, row.previous_selling_price,
            row.last_updated_date, row.last_updated_by
          ]);
          const newId = res.rows[0].id;
          await client.query(`
            INSERT INTO inventory_transactions
              (product_id, product_name, transaction_type, quantity, previous_stock, updated_stock, performed_by, remarks)
            VALUES ($1, $2, 'Opening Stock Entry', $3, 0, $4, 'owner', 'Initial opening stock at system setup')
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
