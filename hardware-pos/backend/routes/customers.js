const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /api/customers - List all customers with computed ledger balances
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        c.id, 
        c.name, 
        c.phone, 
        c.notes, 
        c.created_at,
        COALESCE(i.total_purchased, 0) AS total_purchased,
        (COALESCE(i.total_paid_invoices, 0) + COALESCE(p.total_paid_standalone, 0)) AS total_paid,
        (COALESCE(i.total_purchased, 0) - (COALESCE(i.total_paid_invoices, 0) + COALESCE(p.total_paid_standalone, 0))) AS outstanding_dues,
        GREATEST(i.last_invoice_date, p.last_payment_date, c.created_at) AS last_activity
      FROM customers c
      LEFT JOIN (
        SELECT 
          customer_phone, 
          SUM(total_amount) AS total_purchased, 
          SUM(amount_paid) AS total_paid_invoices,
          MAX(created_at) AS last_invoice_date
        FROM invoices
        WHERE customer_phone IS NOT NULL AND customer_phone != ''
        GROUP BY customer_phone
      ) i ON i.customer_phone = c.phone
      LEFT JOIN (
        SELECT 
          customer_phone, 
          SUM(amount) AS total_paid_standalone,
          MAX(created_at) AS last_payment_date
        FROM payments
        GROUP BY customer_phone
      ) p ON p.customer_phone = c.phone
      ORDER BY c.name ASC
    `);
    res.json({ customers: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/customers - Create a customer
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  const { name, phone, notes = '' } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and Phone are required' });
  }
  try {
    await db.query('INSERT INTO customers (name, phone, notes) VALUES ($1, $2, $3)', [name, phone, notes]);
    const result = await db.query('SELECT * FROM customers WHERE phone = $1', [phone]);
    res.status(201).json({ customer: result.rows[0] });
  } catch (err) {
    if (err.message.includes('unique constraint') || err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'A customer with this phone number already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/customers/:phone - Customer details + transaction ledger
// ---------------------------------------------------------------------------
router.get("/export-all", async (req, res) => {

  try {

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "Hardware ERP";

    workbook.created = new Date();

    //---------------------------------------------------
    // SUMMARY SHEET
    //---------------------------------------------------

    const summarySheet = workbook.addWorksheet("Customer Summary");

    summarySheet.columns = [

      { header: "Customer Name", key: "name", width: 30 },

      { header: "Phone Number", key: "phone", width: 20 },

      { header: "Total Purchased", key: "purchase", width: 20 },

      { header: "Total Paid", key: "paid", width: 20 },

      { header: "Outstanding Due", key: "due", width: 20 }

    ];

    summarySheet.getRow(1).font = {
      bold: true
    };

    //---------------------------------------------------
    // GET ALL CUSTOMERS
    //---------------------------------------------------

    const customerResult = await db.query(`
        SELECT
            c.name,
            c.phone,

            COALESCE(i.total_purchased,0) AS total_purchased,

            (COALESCE(i.total_paid_invoices,0)
            +
            COALESCE(p.total_paid_standalone,0))
            AS total_paid,

            (COALESCE(i.total_purchased,0)

            -

            (

            COALESCE(i.total_paid_invoices,0)

            +

            COALESCE(p.total_paid_standalone,0)

            )

            ) AS outstanding_due

        FROM customers c

        LEFT JOIN(

            SELECT

            customer_phone,

            SUM(total_amount) total_purchased,

            SUM(amount_paid) total_paid_invoices

            FROM invoices

            GROUP BY customer_phone

        ) i

        ON c.phone=i.customer_phone

        LEFT JOIN(

            SELECT

            customer_phone,

            SUM(amount) total_paid_standalone

            FROM payments

            GROUP BY customer_phone

        ) p

        ON c.phone=p.customer_phone

        ORDER BY c.name
        `);

    //---------------------------------------------------
    // LOOP THROUGH EVERY CUSTOMER
    //---------------------------------------------------

    for (const customer of customerResult.rows) {

      //----------------------------------------------
      // ADD TO SUMMARY
      //----------------------------------------------

      summarySheet.addRow({

        name: customer.name,

        phone: customer.phone,

        purchase: Number(customer.total_purchased),

        paid: Number(customer.total_paid),

        due: Number(customer.outstanding_due)

      });

      //----------------------------------------------
      // CREATE CUSTOMER SHEET
      //----------------------------------------------

      const sheet = workbook.addWorksheet(

        customer.name.substring(0, 31)

      );

      sheet.columns = [

        { header: "Date", key: "date", width: 20 },

        { header: "Type", key: "type", width: 15 },

        { header: "Reference", key: "ref", width: 20 },

        { header: "Bill Amount", key: "bill", width: 18 },

        { header: "Amount Paid", key: "paid", width: 18 },

        { header: "Remaining Due", key: "due", width: 18 },

        // { header: "Remarks", key: "remarks", width: 30 }

      ];

      sheet.getRow(1).font = {

        bold: true

      };

      //----------------------------------------------
      // GET LEDGER
      //----------------------------------------------

      const ledger = await db.query(`

            SELECT

            'Invoice' AS type,

            NULL AS ref,

            total_amount,

            amount_paid,

            created_at,

            '' remarks

            FROM invoices

            WHERE customer_phone=$1

            UNION ALL

            SELECT

            'Payment',

            'PMT-'||id,

            amount,

            amount,

            created_at,

            remarks

            FROM payments

            WHERE customer_phone=$2

            ORDER BY created_at

            `, [customer.phone, customer.phone]);

      //----------------------------------------------
      // INSERT LEDGER ROWS
      //----------------------------------------------

      ledger.rows.forEach(row => {

        sheet.addRow({

          date: new Date(row.created_at).toLocaleString(),

          type: row.type,

          ref: row.ref,

          bill: Number(row.total_amount),

          paid: Number(row.amount_paid),

          due: Number(row.total_amount) - Number(row.amount_paid),

          // remarks: row.remarks

        });

      });

    }

    //---------------------------------------------------
    // SEND FILE
    //---------------------------------------------------

    res.setHeader(

      "Content-Type",

      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    );

    res.setHeader(

      "Content-Disposition",

      'attachment; filename="Customers_Report.xlsx"'

    );

    await workbook.xlsx.write(res);

    res.end();

  }

  catch (err) {

    console.log(err);

    res.status(500).json({

      error: err.message

    });

  }

});







// ---------------------------------------------------------------------------
// GET /api/customers/inactive - List inactive customers
// ---------------------------------------------------------------------------
router.get('/inactive', async (req, res) => {
  const days = parseInt(req.query.days, 10) || 60;
  try {
    const result = await db.query(`
      SELECT 
        c.name,
        c.phone,
        i.last_purchase,
        CASE 
          WHEN i.last_purchase IS NULL THEN NULL
          ELSE EXTRACT(DAY FROM (NOW() - i.last_purchase))::integer
        END AS days_inactive,
        COALESCE(i.total_purchased, 0) AS total_purchased,
        (COALESCE(i.total_purchased, 0) - (COALESCE(i.total_paid_invoices, 0) + COALESCE(p.total_paid_standalone, 0))) AS outstanding_due
      FROM customers c
      LEFT JOIN (
        SELECT 
          customer_phone,
          MAX(created_at) AS last_purchase,
          SUM(total_amount) AS total_purchased,
          SUM(amount_paid) AS total_paid_invoices
        FROM invoices
        WHERE customer_phone IS NOT NULL AND customer_phone != ''
        GROUP BY customer_phone
      ) i ON i.customer_phone = c.phone
      LEFT JOIN (
        SELECT 
          customer_phone,
          SUM(amount) AS total_paid_standalone
        FROM payments
        GROUP BY customer_phone
      ) p ON p.customer_phone = c.phone
      WHERE i.last_purchase IS NULL OR i.last_purchase < NOW() - $1 * INTERVAL '1 day'
      ORDER BY days_inactive DESC NULLS FIRST, c.name ASC
    `, [days]);

    res.json({ customers: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:phone', async (req, res) => {
  const { phone } = req.params;
  try {
    const customerRes = await db.query(`
      SELECT 
        c.id, 
        c.name, 
        c.phone, 
        c.notes, 
        c.created_at,
        COALESCE(i.total_purchased, 0) AS total_purchased,
        (COALESCE(i.total_paid_invoices, 0) + COALESCE(p.total_paid_standalone, 0)) AS total_paid,
        (COALESCE(i.total_purchased, 0) - (COALESCE(i.total_paid_invoices, 0) + COALESCE(p.total_paid_standalone, 0))) AS outstanding_dues,
        GREATEST(i.last_invoice_date, p.last_payment_date, c.created_at) AS last_activity
      FROM customers c
      LEFT JOIN (
        SELECT 
          customer_phone, 
          SUM(total_amount) AS total_purchased, 
          SUM(amount_paid) AS total_paid_invoices,
          MAX(created_at) AS last_invoice_date
        FROM invoices
WHERE customer_phone = $1
AND is_deleted = 0
        GROUP BY customer_phone
      ) i ON i.customer_phone = c.phone
      LEFT JOIN (
        SELECT 
          customer_phone, 
          SUM(amount) AS total_paid_standalone,
          MAX(created_at) AS last_payment_date
        FROM payments
        WHERE customer_phone = $2
        GROUP BY customer_phone
      ) p ON p.customer_phone = c.phone
      WHERE c.phone = $3
    `, [phone, phone, phone]);

    const customer = customerRes.rows[0];
    if (!customer) return res.status(404).json({ error: 'Customer not found' });


    const ledgerRes = await db.query(`
SELECT
'invoice' AS type,
id,
id AS invoice_id,
NULL AS ref_number,
customer_phone,
total_amount,
amount_paid,
payment_status,
created_at,
'' AS remarks
FROM invoices
WHERE customer_phone = $1
AND is_deleted = 0

UNION ALL

SELECT
'payment' AS type,
id,
NULL AS invoice_id,
'PMT-' || id AS ref_number,
customer_phone,
amount AS total_amount,
amount AS amount_paid,
'Paid' AS payment_status,
created_at,
remarks
FROM payments
WHERE customer_phone = $2

ORDER BY created_at DESC
`, [phone, phone]);

    res.json({ customer, ledger: ledgerRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/customers/:phone - Update notes & customer profile
// ---------------------------------------------------------------------------
router.put('/:phone', async (req, res) => {
  const { phone } = req.params;
  const { name, newPhone, notes } = req.body;
  try {
    const customerRes = await db.query('SELECT * FROM customers WHERE phone = $1', [phone]);
    const customer = customerRes.rows[0];
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const updatedName = name !== undefined ? name : customer.name;
    const updatedPhone = newPhone !== undefined ? newPhone : customer.phone;
    const updatedNotes = notes !== undefined ? notes : customer.notes;

    const runUpdate = db.transaction(async (client) => {
      // Update customer table
      await client.query('UPDATE customers SET name = $1, phone = $2, notes = $3 WHERE phone = $4', [updatedName, updatedPhone, updatedNotes, phone]);

      // If phone number changed, manually update in invoices (since invoices has no FK cascade)
      if (updatedPhone !== phone) {
        await client.query('UPDATE invoices SET customer_phone = $1 WHERE customer_phone = $2', [updatedPhone, phone]);
      }
    });

    await runUpdate();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/customers/:phone - Delete customer
// ---------------------------------------------------------------------------
router.delete('/:phone', async (req, res) => {
  const { phone } = req.params;
  try {
    const runDelete = db.transaction(async (client) => {
      await client.query('DELETE FROM customers WHERE phone = $1', [phone]);
      await client.query('UPDATE invoices SET customer_phone = \'\' WHERE customer_phone = $1', [phone]);
    });
    await runDelete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/customers/:phone/payments - Record standalone payment
// ---------------------------------------------------------------------------
router.post('/:phone/payments', async (req, res) => {
  const { phone } = req.params;
  const { amount, remarks = '' } = req.body;
  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than zero' });
  }
  try {
    await db.query('INSERT INTO payments (customer_phone, amount, remarks) VALUES ($1, $2, $3)', [phone, Number(amount), remarks]);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/payments/:id - Delete a standalone payment
// ---------------------------------------------------------------------------
router.delete('/payments/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM payments WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// =========================================================
// EXPORT ALL CUSTOMERS TO EXCEL
// GET /api/customers/export-all
// =========================================================



module.exports = router;
