const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

async function nextInvoiceNumber(tenantId) {
  const res = await db.query('SELECT COUNT(*) AS c FROM invoices WHERE tenant_id = $1', [tenantId]);
  return `INV-${String(parseInt(res.rows[0].c, 10) + 1).padStart(5, '0')}`;
}

// ---------------------------------------------------------------------------
// POST /api/invoices - create a bill.
// Always uses each product's CURRENT selling price at the moment of billing,
// then freezes that price into invoice_items forever. Later price changes
// never alter this invoice.
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  const { customer_name = 'Walk-in Customer', customer_phone = '', items = [], amount_paid = 0, payment_status = 'Paid', extraCharges = [] } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one line item is required' });
  }

  try {
    // Validate stock availability up front.
    const products = [];
    for (const item of items) {
      const productRes = await db.query('SELECT * FROM products WHERE id = $1 AND tenant_id = $2', [item.product_id, req.user.tenant_id]);
      const product = productRes.rows[0];
      if (!product) throw new Error(`Product ${item.product_id} not found`);
      const qty = Number(item.quantity);
      if (!qty || qty <= 0) throw new Error(`Invalid quantity for ${product.name}`);

      const enteredPrice = Number(item.selling_price);
      if (isNaN(enteredPrice) || enteredPrice <= 0) {
        throw new Error(`Invalid selling price for ${product.name}`);
      }

      products.push({ product, qty, enteredPrice });
    }

    // const invoiceNumber = await nextInvoiceNumber();
    const now = new Date().toISOString();

    const applyGst = req.body.apply_gst !== false;
    const invoiceNumber = await nextInvoiceNumber(req.user.tenant_id);
    const runTxn = db.transaction(async (client) => {
      // Query tenant GST rate if apply_gst is true
      let gstRate = 0;
      if (applyGst) {
        const tenantRes = await client.query('SELECT gst_rate FROM tenants WHERE id = $1', [req.user.tenant_id]);
        gstRate = Number(tenantRes.rows[0]?.gst_rate || 0);
      }

      // Auto-create customer if phone is provided and doesn't exist yet
      if (customer_phone && customer_phone.trim()) {
        const exists = await client.query('SELECT COUNT(*) AS c FROM customers WHERE phone = $1 AND tenant_id = $2', [customer_phone, req.user.tenant_id]);
        if (parseInt(exists.rows[0].c, 10) === 0) {
          await client.query('INSERT INTO customers (tenant_id, name, phone, notes) VALUES ($1, $2, $3, $4)', [req.user.tenant_id, customer_name, customer_phone, 'Auto-created via billing']);
        }
      }

      let total = 0;
      let extraTotal = 0;
      const invoiceInfo = await client.query(`
  INSERT INTO invoices (
    tenant_id,
    invoice_number,
    customer_name,
    customer_phone,
    created_by,
    total_amount,
    amount_paid,
    payment_status,
    created_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8)
  RETURNING id
`, [
        req.user.tenant_id,
        invoiceNumber,
        customer_name,
        customer_phone,
        req.user.username,
        0,
        payment_status,
        now
      ]);
      const invoiceId = invoiceInfo.rows[0].id;

      for (const { product, qty, enteredPrice } of products) {
        const currentSellingPrice = Number(product.current_selling_price);
        const sellingPriceChanged = enteredPrice !== currentSellingPrice;

        if (sellingPriceChanged) {
          const previousSellingPrice = product.last_selling_price;
          const lastSellingPrice = product.current_selling_price;

          await client.query(`
            UPDATE products SET
              current_selling_price = $1,
              last_selling_price = $2,
              previous_selling_price = $3,
              last_updated_date = $4,
              last_updated_by = $5
            WHERE id = $6 AND tenant_id = $7
          `, [enteredPrice, lastSellingPrice, previousSellingPrice, now, req.user.username, product.id, req.user.tenant_id]);

          await client.query(`
            INSERT INTO price_history
              (tenant_id, product_id, product_name, field_changed, old_price, new_price,
               updated_by, reason)
            VALUES ($1, $2, $3, 'selling_price', $4, $5, $6, 'Updated during Billing')
          `, [req.user.tenant_id, product.id, product.name, currentSellingPrice, enteredPrice, req.user.username]);
        }

        const lineTotal = enteredPrice * qty;
        total += lineTotal;

        await client.query(`
          INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, selling_price, line_total)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [invoiceId, product.id, product.name, qty, enteredPrice, lineTotal]);

        const previousStock = product.current_stock;
        const updatedStock = previousStock - qty;
        await client.query('UPDATE products SET current_stock = $1 WHERE id = $2 AND tenant_id = $3', [updatedStock, product.id, req.user.tenant_id]);

        await client.query(`
INSERT INTO inventory_transactions
(
tenant_id,
product_id,
product_name,
transaction_type,
quantity,
previous_stock,
updated_stock,
performed_by,
remarks,
invoice_id
)
VALUES
(
$1,$2,$3,'Sale',$4,$5,$6,$7,$8,$9
)
`, [
          req.user.tenant_id,
          product.id,
          product.name,
          -qty,
          previousStock,
          updatedStock,
          req.user.username,
          "Sold",
          invoiceId
        ]);
      }



      // Save additional charges
      for (const charge of extraCharges) {

        if (!charge.charge_type || Number(charge.amount) <= 0)
          continue;

        extraTotal += Number(charge.amount);

        await client.query(`
        INSERT INTO invoice_extra_charges
        (
            invoice_id,
            charge_type,
            amount
        )
        VALUES
        (
            $1,$2,$3
        )
    `, [
          invoiceId,
          charge.charge_type,
          Number(charge.amount)
        ]);
      }

      const itemsSubtotal = total;
      const gstAmount = Number(((itemsSubtotal * gstRate) / 100).toFixed(2));
      total = Number((itemsSubtotal + extraTotal + gstAmount).toFixed(2));
      const finalAmountPaid = payment_status === 'Paid' ? total : (Number(amount_paid) || 0);
      const dueAmount = Number((total - finalAmountPaid).toFixed(2));
      await client.query(
        `UPDATE invoices 
         SET total_amount = $1, amount_paid = $2, due_amount = $3, gst_rate = $4, gst_amount = $5 
         WHERE id = $6 AND tenant_id = $7`,
        [total, finalAmountPaid, dueAmount, gstRate, gstAmount, invoiceId, req.user.tenant_id]
      );

      return invoiceId;
    });

    const invoiceId = await runTxn();
    const invoiceRes = await db.query('SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2 AND is_deleted = 0', [invoiceId, req.user.tenant_id]);
    const lineItemsRes = await db.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [invoiceId]);
    const chargesRes = await db.query(
      'SELECT * FROM invoice_extra_charges WHERE invoice_id=$1',
      [invoiceId]
    );
    res.status(201).json({ invoice: invoiceRes.rows[0], items: lineItemsRes.rows, extraCharges: chargesRes.rows });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const invoicesRes = await db.query('SELECT * FROM invoices WHERE tenant_id = $1 AND is_deleted = 0 ORDER BY created_at DESC', [req.user.tenant_id]);
    res.json({ invoices: invoicesRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/deleted', async (req, res) => {
  try {
    const invoicesRes = await db.query('SELECT * FROM invoices WHERE tenant_id = $1 AND is_deleted = 1 ORDER BY deleted_at DESC', [req.user.tenant_id]);
    res.json({ invoices: invoicesRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const invoiceRes = await db.query('SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenant_id]);
    const invoice = invoiceRes.rows[0];
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const itemsRes = await db.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [req.params.id]);
    const chargesRes = await db.query(
      'SELECT * FROM invoice_extra_charges WHERE invoice_id = $1',
      [req.params.id]
    );
    res.json({ invoice, items: itemsRes.rows, extraCharges: chargesRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/pay', async (req, res) => {
  const { amount_paid } = req.body;
  try {
    const invoiceRes = await db.query('SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2 AND is_deleted = 0', [req.params.id, req.user.tenant_id]);
    const invoice = invoiceRes.rows[0];
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    if (amount_paid !== undefined) {
      const newPaid = Number(amount_paid) || 0;
      const status = newPaid >= Number(invoice.total_amount) ? 'Paid' : 'Due';
      const dueAmount = Number(invoice.total_amount) - newPaid;
      await db.query('UPDATE invoices SET amount_paid = $1, due_amount = $2, payment_status = $3 WHERE id = $4 AND tenant_id = $5', [newPaid, dueAmount, status, req.params.id, req.user.tenant_id]);
    } else {
      await db.query('UPDATE invoices SET amount_paid = total_amount, due_amount = 0, payment_status = \'Paid\' WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenant_id]);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




// ---------------------------------------------------------------------------
// GET /api/invoices/:id/whatsapp
// Returns a ready WhatsApp message containing invoice details.
// ---------------------------------------------------------------------------
router.get("/:id/whatsapp", async (req, res) => {

  try {

    const invoiceRes = await db.query(
      "SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2",
      [req.params.id, req.user.tenant_id]
    );

    if (invoiceRes.rows.length === 0) {
      return res.status(404).json({
        error: "Invoice not found",
      });
    }

    const invoice = invoiceRes.rows[0];

    const itemsRes = await db.query(
      `
      SELECT
      product_name,
      quantity,
      selling_price,
      line_total
      FROM invoice_items
      WHERE invoice_id=$1
      `,
      [invoice.id]
    );

    const chargesRes = await db.query(
      `
      SELECT
      charge_type,
      amount
      FROM invoice_extra_charges
      WHERE invoice_id=$1
      `,
      [invoice.id]
    );

    let message = "";

    message += "ShopShere\n\n";

    message += `Dear ${invoice.customer_name},\n\n`;

    message += "ITEMS\n";
    message += "-------------------------\n";

    itemsRes.rows.forEach((item) => {

      message += `${item.product_name}\n`;

      message += `${item.quantity} × ₹${Number(item.selling_price).toFixed(2)} = ₹${Number(item.line_total).toFixed(2)}\n\n`;

    });

    if (chargesRes.rows.length > 0) {

      message += "EXTRA CHARGES\n";

      message += "-------------------------\n";

      chargesRes.rows.forEach((c) => {

        message += `${c.charge_type} : ₹${Number(c.amount).toFixed(2)}\n`;

      });

      message += "\n";

    }

    const extraTotal = chargesRes.rows.reduce(
      (sum, c) => sum + Number(c.amount),
      0
    );

    const itemsTotal = itemsRes.rows.reduce(
      (sum, item) => sum + Number(item.line_total),
      0
    );

    const gstAmount = Number(invoice.gst_amount) || 0;
    const gstRate = Number(invoice.gst_rate) || 0;

    const due =
      Number(invoice.total_amount) -
      Number(invoice.amount_paid);

    message += "-------------------------\n";

    message += `Subtotal : ₹${itemsTotal.toFixed(2)}\n`;
    if (gstRate > 0) {
      const halfRate = (gstRate / 2).toFixed(2).replace(/\.00$/, '');
      const halfAmount = (gstAmount / 2).toFixed(2);
      message += `CGST (${halfRate}%) : ₹${halfAmount}\n`;
      message += `SGST (${halfRate}%) : ₹${halfAmount}\n`;
    }

    message += `Extra Charges : ₹${extraTotal.toFixed(2)}\n`;

    message += `Grand Total : ₹${Number(invoice.total_amount).toFixed(2)}\n`;

    message += `Paid : ₹${Number(invoice.amount_paid).toFixed(2)}\n`;

    message += `Due : ₹${due.toFixed(2)}\n\n`;

    message += "Thank you for shopping with us.";

    res.json({

      phone: invoice.customer_phone,

      message,

    });

  }

  catch (err) {

    console.log(err);

    res.status(500).json({

      error: err.message,

    });

  }

});

// ---------------------------------------------------------------------------
// PUT /api/invoices/:id - update/edit an invoice.
// Reverts product stock levels and inventory transactions, deletes old items
// and extra charges, then inserts the new lines and adjusts stock levels.
// ---------------------------------------------------------------------------
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { customer_name = 'Walk-in Customer', customer_phone = '', items = [], amount_paid = 0, payment_status = 'Paid', extraCharges = [] } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one line item is required' });
  }

  try {
    const invoiceRes = await db.query('SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2 AND is_deleted = 0', [id, req.user.tenant_id]);
    const oldInvoice = invoiceRes.rows[0];
    if (!oldInvoice) return res.status(404).json({ error: 'Invoice not found' });

    // Validate new stock items up front
    const products = [];
    for (const item of items) {
      const productRes = await db.query('SELECT * FROM products WHERE id = $1 AND tenant_id = $2', [item.product_id, req.user.tenant_id]);
      const product = productRes.rows[0];
      if (!product) throw new Error(`Product ${item.product_id} not found`);
      const qty = Number(item.quantity);
      if (!qty || qty <= 0) throw new Error(`Invalid quantity for ${product.name}`);

      const enteredPrice = Number(item.selling_price);
      if (isNaN(enteredPrice) || enteredPrice <= 0) {
        throw new Error(`Invalid selling price for ${product.name}`);
      }

      products.push({ product, qty, enteredPrice });
    }

    const now = new Date().toISOString();
    // const invoiceNumber = oldInvoice.invoice_number;

    const runTxn = db.transaction(async (client) => {
      // Revert old customer's ledger or auto-create customer if needed
      if (customer_phone && customer_phone.trim()) {
        const exists = await client.query('SELECT COUNT(*) AS c FROM customers WHERE phone = $1 AND tenant_id = $2', [customer_phone, req.user.tenant_id]);
        if (parseInt(exists.rows[0].c, 10) === 0) {
          await client.query('INSERT INTO customers (tenant_id, name, phone, notes) VALUES ($1, $2, $3, $4)', [req.user.tenant_id, customer_name, customer_phone, 'Auto-created via billing']);
        }
      }

      // Revert old product stock
      const oldItemsRes = await client.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [id]);
      for (const oldItem of oldItemsRes.rows) {
        await client.query('UPDATE products SET current_stock = current_stock + $1 WHERE id = $2 AND tenant_id = $3', [oldItem.quantity, oldItem.product_id, req.user.tenant_id]);
      }

      // Delete old items, charges, and inventory transactions
      await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);
      await client.query('DELETE FROM invoice_extra_charges WHERE invoice_id = $1', [id]);
      await client.query(
        'DELETE FROM inventory_transactions WHERE invoice_id = $1 AND tenant_id = $2',
        [id, req.user.tenant_id]
      );

      // Process new items
      let total = 0;
      let extraTotal = 0;

      for (const { product, qty, enteredPrice } of products) {
        // Fetch current stock after reverting
        const freshProductRes = await client.query('SELECT * FROM products WHERE id = $1 AND tenant_id = $2', [product.id, req.user.tenant_id]);
        const freshProduct = freshProductRes.rows[0];

        const lineTotal = enteredPrice * qty;
        total += lineTotal;

        // Insert new invoice item
        await client.query(`
          INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, selling_price, line_total)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [id, freshProduct.id, freshProduct.name, qty, enteredPrice, lineTotal]);

        // Update product stock
        const previousStock = freshProduct.current_stock;
        const updatedStock = previousStock - qty;
        await client.query('UPDATE products SET current_stock = $1 WHERE id = $2 AND tenant_id = $3', [updatedStock, freshProduct.id, req.user.tenant_id]);

        // Insert inventory transaction
        await client.query(`
INSERT INTO inventory_transactions
(
tenant_id,
product_id,
product_name,
transaction_type,
quantity,
previous_stock,
updated_stock,
performed_by,
remarks,
invoice_id
)
VALUES
(
$1,$2,$3,'Sale',$4,$5,$6,$7,$8,$9
)
`, [
          req.user.tenant_id,
          product.id,
          product.name,
          -qty,
          previousStock,
          updatedStock,
          req.user.username,
          "Sold",
          id
        ]);
      }

      // Save additional charges
      for (const charge of extraCharges) {
        if (!charge.charge_type || Number(charge.amount) <= 0) continue;
        extraTotal += Number(charge.amount);
        await client.query(`
          INSERT INTO invoice_extra_charges (invoice_id, charge_type, amount)
          VALUES ($1, $2, $3)
        `, [id, charge.charge_type, Number(charge.amount)]);
      }

      total += extraTotal;
      const finalAmountPaid = payment_status === 'Paid' ? total : (Number(amount_paid) || 0);
      const dueAmount = total - finalAmountPaid;

      // Update invoice details
      await client.query(`
        UPDATE invoices
        SET customer_name = $1, customer_phone = $2, total_amount = $3, amount_paid = $4, due_amount = $5, payment_status = $6
        WHERE id = $7 AND tenant_id = $8
      `, [customer_name, customer_phone, total, finalAmountPaid, dueAmount, payment_status, id, req.user.tenant_id]);

      return id;
    });

    await runTxn();

    // Fetch updated invoice to return
    const invoiceResUpdated = await db.query('SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2 AND is_deleted = 0', [id, req.user.tenant_id]);
    const lineItemsResUpdated = await db.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [id]);
    const chargesResUpdated = await db.query('SELECT * FROM invoice_extra_charges WHERE invoice_id = $1', [id]);

    res.json({ invoice: invoiceResUpdated.rows[0], items: lineItemsResUpdated.rows, extraCharges: chargesResUpdated.rows });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});


router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const runTxn = db.transaction(async (client) => {

      // Check invoice
      const invoiceRes = await client.query(
        "SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2",
        [id, req.user.tenant_id]
      );

      if (invoiceRes.rows.length === 0) {
        throw new Error("Invoice not found");
      }

      const invoice = invoiceRes.rows[0];

      if (invoice.is_deleted) {
        throw new Error("Invoice already deleted");
      }

      // Restore stock
      const itemsRes = await client.query(
        "SELECT * FROM invoice_items WHERE invoice_id=$1",
        [id]
      );

      for (const item of itemsRes.rows) {

        await client.query(
          `
          UPDATE products
          SET current_stock = current_stock + $1
          WHERE id=$2 AND tenant_id=$3
          `,
          [
            item.quantity,
            item.product_id,
            req.user.tenant_id
          ]
        );

      }

      // Delete inventory transactions
      await client.query(
        `
        DELETE FROM inventory_transactions
        WHERE invoice_id=$1 AND tenant_id=$2
        `,
        [id, req.user.tenant_id]
      );

      // Soft delete invoice
      await client.query(
        `
        UPDATE invoices
        SET
            is_deleted = 1,
            deleted_at = NOW(),
            deleted_by = $1,
            delete_reason = $2
        WHERE id=$3 AND tenant_id=$4
        `,
        [
          req.user.username,
          "Deleted from Customer Ledger",
          id,
          req.user.tenant_id
        ]
      );

    });

    await runTxn();

    res.json({
      success: true
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      error: err.message
    });

  }
});


router.post("/:id/restore", async (req, res) => {
  const { id } = req.params;

  try {
    const runTxn = db.transaction(async (client) => {
      // Check invoice
      const invoiceRes = await client.query(
        "SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2",
        [id, req.user.tenant_id]
      );

      if (invoiceRes.rows.length === 0) {
        throw new Error("Invoice not found");
      }

      const invoice = invoiceRes.rows[0];

      if (!invoice.is_deleted) {
        throw new Error("Invoice is not deleted");
      }

      // Fetch invoice items
      const itemsRes = await client.query(
        "SELECT * FROM invoice_items WHERE invoice_id=$1",
        [id]
      );

      // Deduct stock and write inventory transactions
      for (const item of itemsRes.rows) {
        // Fetch current product stock
        const productRes = await client.query(
          "SELECT * FROM products WHERE id=$1 AND tenant_id=$2",
          [item.product_id, req.user.tenant_id]
        );
        const product = productRes.rows[0];
        if (!product) {
          throw new Error(`Product "${item.product_name}" not found`);
        }

        const previousStock = product.current_stock;
        const updatedStock = previousStock - item.quantity;

        // Update product stock
        await client.query(
          "UPDATE products SET current_stock = $1 WHERE id = $2 AND tenant_id = $3",
          [updatedStock, product.id, req.user.tenant_id]
        );

        // Insert inventory transaction
        await client.query(`
          INSERT INTO inventory_transactions (
            tenant_id,
            product_id,
            product_name,
            transaction_type,
            quantity,
            previous_stock,
            updated_stock,
            performed_by,
            remarks,
            invoice_id
          ) VALUES ($1, $2, $3, 'Sale', $4, $5, $6, $7, $8, $9)
        `, [
          req.user.tenant_id,
          product.id,
          product.name,
          -item.quantity,
          previousStock,
          updatedStock,
          req.user.username,
          "Restored Bill",
          id
        ]);
      }

      // Mark invoice as active
      await client.query(
        `
        UPDATE invoices
        SET
            is_deleted = 0,
            deleted_at = NULL,
            deleted_by = NULL,
            delete_reason = NULL
        WHERE id=$1 AND tenant_id=$2
        `,
        [id, req.user.tenant_id]
      );
    });

    await runTxn();

    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
