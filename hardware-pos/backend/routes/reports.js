const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Daily stock movement: net quantity moved per product for one calendar day.
router.get('/daily-stock-movement', async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  try {
    const result = await db.query(`
      SELECT product_name,
             SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END) AS stock_in,
             SUM(CASE WHEN quantity < 0 THEN -quantity ELSE 0 END) AS stock_out,
             SUM(quantity) AS net_change
      FROM inventory_transactions
      WHERE tenant_id = $2 AND created_at::date = $1::date
      GROUP BY product_id, product_name
      ORDER BY product_name
    `, [date, req.user.tenant_id]);
    res.json({ date, movement: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Monthly stock movement: same idea, grouped over a year-month.
router.get('/monthly-stock-movement', async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7); // YYYY-MM
  try {
    const result = await db.query(`
      SELECT product_name,
             SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END) AS stock_in,
             SUM(CASE WHEN quantity < 0 THEN -quantity ELSE 0 END) AS stock_out,
             SUM(quantity) AS net_change
      FROM inventory_transactions
      WHERE tenant_id = $2 AND TO_CHAR(created_at, 'YYYY-MM') = $1
      GROUP BY product_id, product_name
      ORDER BY product_name
    `, [month, req.user.tenant_id]);
    res.json({ month, movement: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Current stock value: quantity on hand x purchase price (cost basis) and
// x selling price (potential revenue), per product and totals.
// router.get('/stock-value', async (_req, res) => {
//   try {
//     const result = await db.query(`
//       SELECT id, name, current_stock, current_selling_price,
//              (current_stock * purchase_price) AS cost_value,
//              (current_stock * current_selling_price) AS selling_value
//       FROM products
//       ORDER BY name
//     `);
//     const rows = result.rows;
//     const totals = rows.reduce((acc, r) => {
//       acc.total_cost_value += Number(r.cost_value);
//       acc.total_selling_value += Number(r.selling_value);
//       return acc;
//     }, { total_cost_value: 0, total_selling_value: 0 });
//     res.json({ products: rows, totals });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// Stock added vs stock sold over a date range.
// router.get('/added-vs-sold', async (req, res) => {
//   const from = req.query.from || '2000-01-01';
//   const to = req.query.to || '2999-12-31';
//   try {
//     const result = await db.query(`
//       SELECT product_name,
//              SUM(CASE WHEN transaction_type IN ('New Stock Purchase','Opening Stock Entry','Customer Return')
//                       THEN quantity ELSE 0 END) AS stock_added,
//              SUM(CASE WHEN transaction_type = 'Sale' THEN -quantity ELSE 0 END) AS stock_sold
//       FROM inventory_transactions
//       WHERE created_at::date BETWEEN $1::date AND $2::date
//       GROUP BY product_id, product_name
//       ORDER BY product_name
//     `, [from, to]);
//     res.json({ from, to, comparison: result.rows });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// Fast moving: highest total units sold, most recently. Slow moving: inverse.
router.get('/fast-moving', async (req, res) => {
  const limit = Number(req.query.limit) || 10;
  const from = req.query.from || '2000-01-01';
  const to = req.query.to || '2999-12-31';

  try {
    const result = await db.query(
      `
      SELECT
        p.name AS product_name,
        SUM(-t.quantity) AS units_sold,
        MAX(t.created_at) AS last_sale
      FROM inventory_transactions t
      JOIN products p ON t.product_id = p.id
      WHERE
        t.tenant_id = $4
        AND p.tenant_id = $4
        AND t.transaction_type = 'Sale'
        AND COALESCE(p.is_deleted, 0) = 0
        AND DATE(t.created_at) BETWEEN $1 AND $2
      GROUP BY
        p.id,
        p.name
      ORDER BY
        units_sold DESC
      LIMIT $3
      `,
      [from, to, limit, req.user.tenant_id]
    );

    res.json({
      fastMoving: result.rows
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

router.get('/slow-moving', async (req, res) => {
  const limit = Number(req.query.limit) || 10;
  const from = req.query.from || '2000-01-01';
  const to = req.query.to || '2999-12-31';

  try {
    const result = await db.query(
      `
      SELECT
        p.name AS product_name,
        COALESCE(SUM(-t.quantity),0) AS units_sold,
        MAX(t.created_at) AS last_sale
      FROM products p
      LEFT JOIN inventory_transactions t
      ON p.id=t.product_id
      AND t.tenant_id = $4
      AND t.transaction_type='Sale'
      AND DATE(t.created_at) BETWEEN $1 AND $2
      WHERE p.tenant_id = $4 AND COALESCE(p.is_deleted, 0) = 0
      GROUP BY
        p.id,
        p.name
      ORDER BY
        units_sold ASC,
        p.name ASC
      LIMIT $3
      `,
      [from, to, limit, req.user.tenant_id]
    );

    res.json({
      slowMoving: result.rows
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

module.exports = router;
