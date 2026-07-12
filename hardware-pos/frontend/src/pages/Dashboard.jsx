import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatWhatsAppNumber } from '../utils/phone';

export default function Dashboard() {
  const [stats, setStats] = useState({ todaySales: 0, todayCustomers: 0, todayInvoices: 0, outstandingDues: 0 });
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payingId, setPayingId] = useState(null);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [statsData, invoicesData] = await Promise.all([
        api.dashboard.stats(),
        api.invoices(),
      ]);
      setStats(statsData);
      setInvoices(invoicesData.invoices || []);
    } catch (err) {
      setError('Failed to load dashboard data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleMarkAsPaid(id) {
    if (!window.confirm('Are you sure you want to mark this invoice as fully paid?')) return;
    setPayingId(id);
    try {
      await api.payInvoice(id);
      await loadData();
    } catch (err) {
      alert('Failed to update invoice payment: ' + err.message);
    } finally {
      setPayingId(null);
    }
  }

  function handleWhatsAppReminder(inv) {
    const outstanding = Number(inv.total_amount) - Number(inv.amount_paid);
    const phone = formatWhatsAppNumber(inv.customer_phone);

    if (!phone) {
      alert("Customer phone number not found or invalid.");
      return;
    }

    const message =
      `Dear ${inv.customer_name},

This is a friendly reminder from ShopSphere.


Outstanding Due : ₹${outstanding.toFixed(2)}

Kindly clear your pending payment at your earliest convenience.

Thank you.
ShopSphere`;

    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      "_blank"
    );
  }

  const dueInvoices = invoices.filter(
    (inv) => inv.payment_status === 'Due' || inv.amount_paid < inv.total_amount
  );

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <div>
          <div className="page-title">Operations Dashboard</div>
          <div className="page-sub">Live monitoring of today's sales, unique customers, and pending dues.</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadData} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh Stats'}
        </button>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 20 }}>{error}</div>}

      {/* Stats Grid */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card glass-card">
          <div className="stat-icon sales-icon">₹</div>
          <div className="stat-content">
            <div className="stat-label">Today's Sales</div>
            <div className="stat-value">₹{stats.todaySales.toFixed(2)}</div>
            <div className="stat-trend trend-up">▲ Live Sales</div>
          </div>
        </div>

        <div className="stat-card glass-card">
          <div className="stat-icon customer-icon">👥</div>
          <div className="stat-content">
            <div className="stat-label">Today's Customers</div>
            <div className="stat-value">{stats.todayCustomers}</div>
            <div className="stat-trend text-dim">Unique Walk-ins</div>
          </div>
        </div>

        {/* <div className="stat-card glass-card">
          <div className="stat-icon invoice-icon">🧾</div>
          <div className="stat-content">
            <div className="stat-label">Invoices Created</div>
            <div className="stat-value">{stats.todayInvoices}</div>
            <div className="stat-trend text-dim">Total Bills Today</div>
          </div>
        </div> */}

        <div className="stat-card glass-card warning-card">
          <div className="stat-icon dues-icon">⚠️</div>
          <div className="stat-content">
            <div className="stat-label">Outstanding Dues</div>
            <div className="stat-value">₹{stats.outstandingDues.toFixed(2)}</div>
            <div className="stat-trend text-rust">Pending Collection</div>
          </div>
        </div>
      </div>

      {/* Due Notifications Section */}
      <div className="card notification-section">
        <div className="section-title-container">
          <span className="due-bell">🔔</span>
          <div className="section-title" style={{ margin: 0 }}>Dues Alerts & Follow-ups</div>
          <span className="badge badge-rust">{dueInvoices.length} Pending</span>
        </div>
        <p className="page-sub" style={{ padding: 0, marginTop: 4, marginBottom: 16 }}>
          All customer invoices currently containing outstanding balances. Settle them once payment is collected.
        </p>

        {loading ? (
          <div className="empty-state">Loading dashboard...</div>
        ) : dueInvoices.length === 0 ? (
          <div className="empty-state success-state">
            <span className="party-popper">🎉</span> All invoices are fully settled! No outstanding dues.
          </div>
        ) : (
          <table className="ledger">
            <thead>
              <tr>
                <th>Customer</th>
                <th className="num">Total Bill</th>
                <th className="num">Paid So Far</th>
                <th className="num">Outstanding Due</th>
                <th>Created At</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {dueInvoices.map((inv) => {
                const outstanding = inv.total_amount - inv.amount_paid;
                return (
                  <tr key={inv.id}>
                    <td>
                      <strong>{inv.customer_name}</strong>
                    </td>
                    <td className="num">₹{inv.total_amount.toFixed(2)}</td>
                    <td className="num qty-in">₹{inv.amount_paid.toFixed(2)}</td>
                    <td className="num qty-out" style={{ fontWeight: 600 }}>
                      ₹{outstanding.toFixed(2)}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                      {new Date(inv.created_at).toLocaleString()}
                    </td>
                    <td style={{ textAlign: "center" }}>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          gap: 8,
                        }}
                      >

                        <button
                          className="btn btn-sm btn-success"
                          onClick={() => handleMarkAsPaid(inv.id)}
                          disabled={payingId === inv.id}
                        >
                          {payingId === inv.id ? "Settling..." : "Mark as Paid"}
                        </button>

                        <button
                          className="btn btn-whatsapp btn-sm"
                          onClick={() => handleWhatsAppReminder(inv)}
                        >
                          WhatsApp
                        </button>

                      </div>

                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
