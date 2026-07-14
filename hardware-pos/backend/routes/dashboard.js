const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/stats', async (req, res) => {
  try {
    // 1. Today's total sales
    const salesRes = await db.query(`
      SELECT COALESCE(SUM(total_amount), 0) AS total_sales
      FROM invoices
      WHERE tenant_id = $1 AND created_at::date = CURRENT_DATE
    `, [req.user.tenant_id]);

    // 2. Today's live unique customers count
    const customerRes = await db.query(`
      SELECT COUNT(DISTINCT customer_name) AS customer_count
      FROM invoices
      WHERE tenant_id = $1 AND created_at::date = CURRENT_DATE
    `, [req.user.tenant_id]);

    // 3. Today's invoices count
    const invoiceRes = await db.query(`
      SELECT COUNT(*) AS invoice_count
      FROM invoices
      WHERE tenant_id = $1 AND created_at::date = CURRENT_DATE
    `, [req.user.tenant_id]);

    // 4. Total outstanding dues
    const duesRes = await db.query(`
      SELECT COALESCE(SUM(total_amount - amount_paid), 0) AS total_dues
      FROM invoices
      WHERE tenant_id = $1 AND payment_status = 'Due'
    `, [req.user.tenant_id]);

    res.json({
      todaySales: Number(salesRes.rows[0].total_sales),
      todayCustomers: parseInt(customerRes.rows[0].customer_count, 10),
      todayInvoices: parseInt(invoiceRes.rows[0].invoice_count, 10),
      outstandingDues: Number(duesRes.rows[0].total_dues),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
