const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const VALID_TYPES = [
  'New Stock Purchase', 'Sale', 'Customer Return', 'Supplier Return',
  'Manual Stock Adjustment', 'Damaged Item', 'Lost Item',
  'Stock Correction', 'Opening Stock Entry',
];

// Transaction types that increase stock vs decrease stock, used to sign
// the quantity automatically so the caller only ever sends a positive number.
const DECREASES_STOCK = new Set(['Sale', 'Supplier Return', 'Damaged Item', 'Lost Item']);

// ---------------------------------------------------------------------------
// POST /api/inventory/transactions - record any stock movement.
// This is the single choke point every stock change must go through, so the
// audit trail is always complete no matter which part of the app triggers it.
// ---------------------------------------------------------------------------
router.post('/transactions', async (req, res) => {
  const {
    product_id, transaction_type, quantity, remarks = '',
    supplier = '', signed = false,
  } = req.body;

  if (!VALID_TYPES.includes(transaction_type)) {
    return res.status(400).json({ error: `Invalid transaction type: ${transaction_type}` });
  }
  const qtyNum = Number(quantity);
  if (!qtyNum || Number.isNaN(qtyNum)) {
    return res.status(400).json({ error: 'Quantity must be a non-zero number' });
  }

  try {
    const productRes = await db.query('SELECT * FROM products WHERE id = $1 AND tenant_id = $2', [product_id, req.user.tenant_id]);
    const product = productRes.rows[0];
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Caller can pass an already-signed delta (signed=true), otherwise we infer
    // the sign from the transaction type so UIs can just ask "how many".
    let delta = qtyNum;
    if (!signed) {
      const magnitude = Math.abs(qtyNum);
      delta = DECREASES_STOCK.has(transaction_type) ? -magnitude : magnitude;
    }

    const previousStock = product.current_stock;
    const updatedStock = previousStock + delta;
    if (updatedStock < 0) {
      return res.status(400).json({ error: `Insufficient stock. Available: ${previousStock}, requested: ${Math.abs(delta)}` });
    }

    const runTxn = db.transaction(async (client) => {
      await client.query('UPDATE products SET current_stock = $1 WHERE id = $2 AND tenant_id = $3', [updatedStock, product.id, req.user.tenant_id]);
      const info = await client.query(`
        INSERT INTO inventory_transactions
          (tenant_id, product_id, product_name, transaction_type, quantity, previous_stock, updated_stock,
           performed_by, remarks, supplier)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [req.user.tenant_id, product.id, product.name, transaction_type, delta, previousStock, updatedStock,
      req.user.username, remarks, supplier]);
      return info.rows[0].id;
    });

    const id = await runTxn();
    const recordRes = await db.query('SELECT * FROM inventory_transactions WHERE id = $1 AND tenant_id = $2', [id, req.user.tenant_id]);
    res.status(201).json({ transaction: recordRes.rows[0], updated_stock: updatedStock });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/inventory/transactions - the Inventory Ledger, filterable by
// product, transaction type, date range, user, supplier, invoice number.
// ---------------------------------------------------------------------------
router.get('/transactions', async (req, res) => {
  const { product, type, from, to, user, supplier } = req.query;

  const clauses = ['tenant_id = $1'];
  const params = [req.user.tenant_id];

  if (product) { clauses.push('product_id = $' + params.push(product)); }
  if (type) { clauses.push('transaction_type = $' + params.push(type)); }
  if (from) { clauses.push('created_at::date >= $' + params.push(from) + '::date'); }
  if (to) { clauses.push('created_at::date <= $' + params.push(to) + '::date'); }
  if (user) { clauses.push('performed_by = $' + params.push(user)); }
  if (supplier) { clauses.push('supplier ILIKE $' + params.push(`%${supplier}%`)); }
  // if (invoice_number) { clauses.push('invoice_number ILIKE $' + params.push(`%${invoice_number}%`)); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  try {
    const result = await db.query(
      `SELECT * FROM inventory_transactions ${where} ORDER BY created_at DESC, id DESC LIMIT 1000`,
      params
    );
    res.json({ transactions: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/transaction-types', (_req, res) => res.json({ types: VALID_TYPES }));

module.exports = router;
