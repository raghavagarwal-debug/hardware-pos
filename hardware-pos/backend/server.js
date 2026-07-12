const express = require('express');
const cors = require('cors');

require('./db'); // initializes schema + seed data on first run

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const inventoryRoutes = require('./routes/inventory');
const invoiceRoutes = require('./routes/invoices');
const reportRoutes = require('./routes/reports');
const dashboardRoutes = require('./routes/dashboard');
const customerRoutes = require('./routes/customers');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
// app.use('/api/inventory', inventoryRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/customers', customerRoutes);

// Central error handler as a safety net for anything thrown synchronously.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Hardware POS backend running on http://localhost:${PORT}`);
  console.log('logins -> owner/owner@123, owner1/owner1@123, worker/worker@123');
});
