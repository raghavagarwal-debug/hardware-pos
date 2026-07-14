const express = require('express');
const db = require('../db');
const { requireAuth, requireOwner } = require('../middleware/auth');

const multer = require("multer");
const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");
const upload = multer({
  dest: "uploads/",
});

const router = express.Router();
router.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /api/products  - list all products (every authorized user sees live prices)
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM products WHERE tenant_id = $1 AND is_deleted = 0 ORDER BY name', [req.user.tenant_id]);
    res.json({ products: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/products/:id - full detail: product + price history + stock timeline
// ---------------------------------------------------------------------------
router.post(
  "/import",
  requireOwner,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "No file uploaded",
        });
      }

      const workbook = new ExcelJS.Workbook();

      await workbook.xlsx.readFile(req.file.path);

      const sheet = workbook.worksheets[0];

      let added = 0;
      let skipped = 0;

      for (let i = 2; i <= sheet.rowCount; i++) {

        const row = sheet.getRow(i);

        const name = String(row.getCell(1).value || "").trim();

        const unit = "pcs";

        const selling = Number(row.getCell(2).value || 0);
        if (!name) continue;

        const exists = await db.query(
          "SELECT id FROM products WHERE tenant_id = $1 AND LOWER(name)=LOWER($2)",
          [req.user.tenant_id, name]
        );

        if (exists.rows.length > 0) {
          skipped++;
          continue;
        }

        await db.query(
          `
INSERT INTO products
(
tenant_id,
name,
unit,
current_selling_price,
last_selling_price,
previous_selling_price,
last_updated_date,
last_updated_by
)
VALUES
(
$1,$2,$3,$4,$5,$6,NOW(),'Import'
)
`,
          [
            req.user.tenant_id,
            name,
            unit,
            selling,
            selling,
            null,
          ]
        );

        added++;
      }

      fs.unlinkSync(req.file.path);

      res.json({
        success: true,
        added,
        skipped,
      });

    } catch (err) {

      console.log(err);

      res.status(500).json({
        error: err.message,
      });

    }
  }
);
router.get('/:id', async (req, res) => {
  try {
    const productRes = await db.query('SELECT * FROM products WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenant_id]);
    const product = productRes.rows[0];
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const priceHistoryRes = await db.query(
      'SELECT * FROM price_history WHERE product_id = $1 AND tenant_id = $2 ORDER BY created_at DESC, id DESC',
      [req.params.id, req.user.tenant_id]
    );

    const inventoryTimelineRes = await db.query(
      'SELECT * FROM inventory_transactions WHERE product_id = $1 AND tenant_id = $2 ORDER BY created_at DESC, id DESC',
      [req.params.id, req.user.tenant_id]
    );

    res.json({
      product,
      priceHistory: priceHistoryRes.rows,
      inventoryTimeline: inventoryTimelineRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/products - create a new product (Owner only), with opening stock
// ---------------------------------------------------------------------------
router.post('/', requireOwner, async (req, res) => {
  const {
    name, unit = 'pcs', current_selling_price = 0 } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'Product name is required' });

  const now = new Date().toISOString();
  try {
    const createTxn = db.transaction(async (client) => {
      const info = await client.query(`
INSERT INTO products
(
    tenant_id,
    name,
    unit,
    current_selling_price,
    last_selling_price,
    previous_selling_price,
    last_updated_date,
    last_updated_by
)
VALUES
(
    $1,$2,$3,$4,$5,$6,$7,$8
)
RETURNING id
`, [
        req.user.tenant_id,
        name.trim(),
        unit,
        current_selling_price,
        current_selling_price,   // Initial last selling price
        null,                    // No previous selling price yet
        now,
        req.user.username
      ]);
      const productId = info.rows[0].id;
      return productId;
    });

    const productId = await createTxn();
    const productRes = await db.query('SELECT * FROM products WHERE id = $1 AND tenant_id = $2', [productId, req.user.tenant_id]);
    res.status(201).json({ product: productRes.rows[0] });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/products/:id/price - Owner-only price update.
// Updates current_selling_price and/or market_price, records price history,
// and rolls last_selling_price -> previous_selling_price correctly.
// Never touches historical invoices - those keep their frozen price forever.
// ---------------------------------------------------------------------------
router.put('/:id/price', requireOwner, async (req, res) => {
  try {
    const productRes = await db.query('SELECT * FROM products WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenant_id]);
    const product = productRes.rows[0];
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const { current_selling_price, market_price, dealer_price, reason = '' } = req.body;

    const sellingChanged = current_selling_price !== undefined
      && Number(current_selling_price) !== Number(product.current_selling_price);
    const marketChanged = market_price !== undefined
      && Number(market_price) !== Number(product.market_price);

    if (!sellingChanged && !marketChanged && dealer_price === undefined) {
      return res.status(400).json({ error: 'No price change detected' });
    }

    const now = new Date().toISOString();
    const newMarket = market_price !== undefined ? Number(market_price) : Number(product.market_price);
    const newDealer = dealer_price !== undefined ? Number(dealer_price) : (product.dealer_price !== null ? Number(product.dealer_price) : null);

    const updateTxn = db.transaction(async (client) => {
      const newSelling = sellingChanged ? Number(current_selling_price) : Number(product.current_selling_price);

      // Roll forward selling-price snapshots only when the selling price actually changes.
      const previousSellingPrice = sellingChanged ? product.last_selling_price : product.previous_selling_price;
      const lastSellingPrice = sellingChanged ? product.current_selling_price : product.last_selling_price;

      await client.query(`
        UPDATE products SET
          current_selling_price = $1,
          market_price = $2,
          dealer_price = $3,
          last_selling_price = $4,
          previous_selling_price = $5,
          last_updated_date = $6,
          last_updated_by = $7
        WHERE id = $8 AND tenant_id = $9
      `, [newSelling, newMarket, newDealer, lastSellingPrice, previousSellingPrice, now, req.user.username, product.id, req.user.tenant_id]);

      let fieldChanged = null;
      if (sellingChanged && marketChanged) fieldChanged = 'both';
      else if (sellingChanged) fieldChanged = 'selling_price';
      else if (marketChanged) fieldChanged = 'market_price';

      if (fieldChanged) {
        await client.query(`
          INSERT INTO price_history
            (tenant_id, product_id, product_name, field_changed, old_price, new_price,
             old_market_price, new_market_price, updated_by, reason)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          req.user.tenant_id,
          product.id, product.name, fieldChanged,
          sellingChanged ? product.current_selling_price : null,
          sellingChanged ? newSelling : null,
          marketChanged ? product.market_price : null,
          marketChanged ? newMarket : null,
          req.user.username, reason
        ]);
      }
    });

    await updateTxn();
    const updatedRes = await db.query('SELECT * FROM products WHERE id = $1 AND tenant_id = $2', [product.id, req.user.tenant_id]);
    res.json({ product: updatedRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/products/:id/price-history
// ---------------------------------------------------------------------------
router.get('/:id/price-history', async (req, res) => {
  try {
    const rowsRes = await db.query(
      'SELECT * FROM price_history WHERE product_id = $1 AND tenant_id = $2 ORDER BY created_at DESC, id DESC',
      [req.params.id, req.user.tenant_id]
    );
    res.json({ priceHistory: rowsRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/products/:id/inventory-timeline
// ---------------------------------------------------------------------------
router.get('/:id/inventory-timeline', async (req, res) => {
  try {
    const rowsRes = await db.query(
      'SELECT * FROM inventory_transactions WHERE product_id = $1 AND tenant_id = $2 ORDER BY created_at DESC, id DESC',
      [req.params.id, req.user.tenant_id]
    );
    res.json({ inventoryTimeline: rowsRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/products/:id - Soft delete product
// ---------------------------------------------------------------------------
router.delete('/:id', requireOwner, async (req, res) => {
  try {
    const productRes = await db.query('SELECT * FROM products WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenant_id]);
    const product = productRes.rows[0];
    if (!product) return res.status(404).json({ error: 'Product not found' });

    await db.query('UPDATE products SET is_deleted = 1 WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenant_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/products/:id - Update product details (name, unit, current_selling_price)
// ---------------------------------------------------------------------------
router.put('/:id', async (req, res) => {
  try {
    const productRes = await db.query('SELECT * FROM products WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenant_id]);
    const product = productRes.rows[0];
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const { name, unit, current_selling_price } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ error: 'Product name is required' });

    const sellingChanged = current_selling_price !== undefined
      && Number(current_selling_price) !== Number(product.current_selling_price);

    // Enforce role: only owners can update the selling price
    if (sellingChanged && req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only the Owner can change the product selling price' });
    }

    const now = new Date().toISOString();

    const updateTxn = db.transaction(async (client) => {
      const newSelling = sellingChanged ? Number(current_selling_price) : Number(product.current_selling_price);

      // Roll forward selling-price snapshots only when the selling price actually changes.
      const previousSellingPrice = sellingChanged ? product.last_selling_price : product.previous_selling_price;
      const lastSellingPrice = sellingChanged ? product.current_selling_price : product.last_selling_price;

      await client.query(`
        UPDATE products SET
          name = $1,
          unit = $2,
          current_selling_price = $3,
          last_selling_price = $4,
          previous_selling_price = $5,
          last_updated_date = $6,
          last_updated_by = $7
        WHERE id = $8 AND tenant_id = $9
      `, [
        name.trim(),
        unit || 'pcs',
        newSelling,
        lastSellingPrice,
        previousSellingPrice,
        now,
        req.user.username,
        product.id,
        req.user.tenant_id
      ]);

      if (sellingChanged) {
        await client.query(`
          INSERT INTO price_history
            (tenant_id, product_id, product_name, field_changed, old_price, new_price, updated_by, reason)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          req.user.tenant_id,
          product.id,
          name.trim(),
          'selling_price',
          product.current_selling_price,
          newSelling,
          req.user.username,
          'Edited from billing section'
        ]);
      }
    });

    await updateTxn();
    const updatedRes = await db.query('SELECT * FROM products WHERE id = $1 AND tenant_id = $2', [product.id, req.user.tenant_id]);
    res.json({ product: updatedRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
