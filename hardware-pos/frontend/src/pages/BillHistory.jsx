import { useEffect, useState, useMemo } from 'react';
import { api } from '../api';
import { formatWhatsAppNumber } from '../utils/phone';
import { useAuth } from '../AuthContext.jsx';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function BillHistory() {
  const { tenant } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('live'); // 'live' or 'deleted'

  // Date filter state (YYYY-MM-DD or null)
  const [selectedDate, setSelectedDate] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Modal detail states
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [modalDetails, setModalDetails] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  // Fetch all invoices on mount or viewMode change
  async function loadInvoices() {
    setLoading(true);
    setError('');
    try {
      const res = viewMode === 'live' ? await api.invoices() : await api.deletedInvoices();
      setInvoices(res.invoices || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelectedDate(null);
    loadInvoices();
  }, [viewMode]);

  // Restore a deleted invoice
  async function handleRestoreInvoice(id) {
    const confirmRestore = window.confirm(
      "Are you sure you want to restore this bill?\n\nThis will deduct the items from stock again."
    );
    if (!confirmRestore) return;

    try {
      await api.restoreInvoice(id);
      alert("Bill successfully restored!");
      closeDetailsModal();
      loadInvoices();
    } catch (err) {
      alert("Failed to restore bill: " + err.message);
    }
  }

  // Convert database timestamp to local YYYY-MM-DD for filter matching
  function getLocalDateString(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Display date formatter (e.g. "10 Jul 2026, 02:30 PM")
  function formatDisplayDateTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  // Index invoices by date for calendar dot lookup (O(1))
  const invoicesByDate = useMemo(() => {
    const groups = {};
    invoices.forEach(inv => {
      const dateStr = getLocalDateString(inv.created_at);
      if (!groups[dateStr]) {
        groups[dateStr] = [];
      }
      groups[dateStr].push(inv);
    });
    return groups;
  }, [invoices]);

  // Filtered invoices according to selectedDate
  const filteredInvoices = useMemo(() => {
    if (!selectedDate) return invoices;
    return invoices.filter(inv => getLocalDateString(inv.created_at) === selectedDate);
  }, [invoices, selectedDate]);

  // Calculate sum of total invoice amounts under current filter
  const totalSalesAmount = useMemo(() => {
    return filteredInvoices.reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0);
  }, [filteredInvoices]);

  // Generate calendar days for grid layout
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday, 6 is Saturday
    const totalDays = new Date(year, month + 1, 0).getDate(); // Days in current month

    const days = [];

    // Fill padding empty spaces
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ key: `empty-${i}`, dayNum: null, dateStr: null });
    }

    // Fill days of the month
    const pad = (n) => String(n).padStart(2, '0');
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${pad(month + 1)}-${pad(d)}`;
      days.push({
        key: `day-${d}`,
        dayNum: d,
        dateStr
      });
    }

    return days;
  }, [currentMonth]);

  const handlePrevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Open invoice detail popup modal and load products
  async function openInvoiceDetails(id) {
    setSelectedInvoiceId(id);
    setModalLoading(true);
    setModalError('');
    setModalDetails(null);
    try {
      const details = await api.invoice(id);
      setModalDetails(details);
    } catch (err) {
      setModalError(err.message);
    } finally {
      setModalLoading(false);
    }
  }

  // Close the popup modal
  const closeDetailsModal = () => {
    setSelectedInvoiceId(null);
    setModalDetails(null);
    setModalError('');
  };

  // WhatsApp helper
  async function handleWhatsAppShare(id) {
    try {
      const data = await api.invoiceWhatsApp(id);
      const formattedPhone = formatWhatsAppNumber(data.phone);
      if (!formattedPhone) {
        alert('Customer phone number is empty or invalid.');
        return;
      }
      const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(data.message)}`;
      window.open(url, '_blank');
    } catch (err) {
      alert('Failed to retrieve WhatsApp details: ' + err.message);
    }
  }

  // Format Helper: format date to nice header format (e.g. "July 10, 2026")
  function formatFriendlyDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Bill History</div>
          <div className="page-sub">
            {viewMode === 'live'
              ? 'View live saved invoices and filter day-by-day.'
              : 'View deleted invoices and restore them.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="btn-group" style={{ display: 'flex', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <button
              className={`btn btn-sm ${viewMode === 'live' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: 0, border: 'none' }}
              onClick={() => setViewMode('live')}
            >
              Live Bills
            </button>

            <button
              className={`btn btn-sm ${viewMode === 'deleted' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: 0, border: 'none' }}
              onClick={() => setViewMode('deleted')}
            >
              🗑️ Deleted Bills (Trash)
            </button>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={loadInvoices}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="bill-history-container">
        {/* LEFT COLUMN: Calendar */}
        <div className="calendar-card">
          <div className="calendar-header">
            <button className="calendar-nav-btn" onClick={handlePrevMonth}>◀</button>
            <span className="calendar-title">
              {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </span>
            <button className="calendar-nav-btn" onClick={handleNextMonth}>▶</button>
          </div>

          <div className="calendar-grid">
            {WEEKDAY_NAMES.map((name, idx) => (
              <div key={idx} className="calendar-weekday">
                {name}
              </div>
            ))}

            {calendarDays.map((day) => {
              if (day.dayNum === null) {
                return <div key={day.key} className="calendar-day empty" />;
              }

              const isSelected = selectedDate === day.dateStr;
              const hasBills = invoicesByDate[day.dateStr]?.length > 0;
              const billCount = invoicesByDate[day.dateStr]?.length || 0;

              return (
                <div
                  key={day.key}
                  className={`calendar-day ${isSelected ? 'selected' : ''} ${hasBills ? 'has-bills' : ''}`}
                  onClick={() => setSelectedDate(isSelected ? null : day.dateStr)}
                  title={hasBills ? `${billCount} bill(s)` : 'No bills'}
                >
                  <span>{day.dayNum}</span>
                  {hasBills && <span className="calendar-day-dot" />}
                </div>
              );
            })}
          </div>

          {selectedDate && (
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button
                className="btn btn-sm"
                style={{ width: '100%' }}
                onClick={() => setSelectedDate(null)}
              >
                Clear Calendar Filter
              </button>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Invoice List */}
        <div>
          <div className="history-list-header">
            <div className="history-list-title">
              {viewMode === 'live'
                ? (selectedDate ? `Bills on ${formatFriendlyDate(selectedDate)}` : 'Live Bill History')
                : (selectedDate ? `Deleted Bills on ${formatFriendlyDate(selectedDate)}` : 'Deleted Bill History (Trash)')}
            </div>
            <div className={`tag ${viewMode === 'live' ? 'tag-in' : 'tag-out'}`}>
              Total: {filteredInvoices.length} Bills | ₹{totalSalesAmount.toFixed(2)}
            </div>
          </div>

          {loading ? (
            <div className="empty-state">Loading invoices...</div>
          ) : filteredInvoices.length === 0 ? (
            <div className="empty-state">
              {selectedDate
                ? (viewMode === 'live' ? 'No sales recorded for this date.' : 'No deleted bills for this date.')
                : (viewMode === 'live' ? 'No bills found in history.' : 'No deleted bills found in trash.')}
            </div>
          ) : (
            <div>
              {filteredInvoices.map((inv) => (
                <div
                  key={inv.id}
                  className="bill-card-item"
                  onClick={() => openInvoiceDetails(inv.id)}
                  style={viewMode === 'deleted' ? { borderLeft: '3px solid var(--rust)' } : {}}
                >
                  <div className="bill-card-left">
                    <span className="bill-inv-num" style={{ color: viewMode === 'deleted' ? 'var(--rust)' : 'var(--text)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                      Sales Invoice {viewMode === 'deleted' && '(Deleted)'}
                    </span>
                    <span className="bill-date-time">
                      📅 {formatDisplayDateTime(inv.created_at)}
                    </span>
                    <span className="bill-created-by">
                      👤 Billed by: <strong>{inv.created_by}</strong>
                    </span>
                    {inv.is_deleted === 1 && inv.deleted_by && (
                      <span className="bill-created-by" style={{ color: 'var(--rust)', marginTop: 2, display: 'block' }}>
                        🗑️ Deleted by: <strong>{inv.deleted_by}</strong>
                      </span>
                    )}
                  </div>
                  <div className="bill-card-right">
                    <span className="bill-customer-name">{inv.customer_name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                      <span className={`tag ${inv.payment_status === 'Paid' ? 'tag-in' : 'tag-out'}`}>
                        {inv.payment_status}
                      </span>
                      <span className="bill-amount">₹{Number(inv.total_amount).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* DETAIL MODAL OVERLAY */}
      {selectedInvoiceId && (
        <div className="modal-backdrop" onClick={closeDetailsModal}>
          <div
            className="card modal-content receipt-modal"
            style={{ background: 'var(--paper-raised)', color: 'var(--text)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {modalLoading && <div className="empty-state">Loading invoice details...</div>}
            {modalError && <div className="error-banner">{modalError}</div>}

            {modalDetails && !modalLoading && (
              <div>
                {/* Receipt Header */}
                <div style={{ textAlign: "center", marginBottom: 18 }}>

                  <div
                    className="brand"
                    style={{
                      fontSize: 30,
                      fontWeight: 700,
                      marginBottom: 6
                    }}
                  >
                    {tenant?.name || 'ShopSphere'}
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: "#555",
                      marginBottom: 10
                    }}
                  >
                    {tenant?.address || 'Jamshedpur'}
                    <br />
                    Phone: {tenant?.phone || '+91 1234567890'}
                    {tenant?.gstin && (
                      <>
                        <br />
                        GSTIN: {tenant.gstin}
                      </>
                    )}
                    &nbsp;
                  </div>

                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 18,
                      letterSpacing: "2px",
                      color: "#666",
                      marginBottom: 10
                    }}
                  >
                    ESTIMATE
                  </div>

                  <hr
                    style={{
                      border: "none",
                      borderTop: "1px dashed #bdbdbd"
                    }}
                  />

                </div>

                {/* Receipt Metadata */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, marginBottom: 16 }}>
                  {/* Bill ID removed */}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Date:</span>
                    <span>{formatDisplayDateTime(modalDetails.invoice.created_at)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Billed By:</span>
                    <span>{modalDetails.invoice.created_by}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Customer:</span>
                    <strong>{modalDetails.invoice.customer_name}</strong>
                  </div>
                  {modalDetails.invoice.customer_phone && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Phone:</span>
                      <span>{modalDetails.invoice.customer_phone}</span>
                    </div>
                  )}
                </div>

                <hr style={{ border: 'none', borderTop: '1px dashed var(--line)', margin: '12px 0' }} />

                {/* Items Table */}
                <div style={{ margin: '12px 0' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                    Purchased Items
                  </div>
                  <table className="ledger" style={{ width: '100%', fontSize: 12.5 }}>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th className="num">Qty</th>
                        <th className="num">Rate</th>
                        <th className="num">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalDetails.items.map((item) => (
                        <tr key={item.id}>
                          <td>{item.product_name}</td>
                          <td className="num">{item.quantity}</td>
                          <td className="num">₹{Number(item.selling_price).toFixed(2)}</td>
                          <td className="num">₹{Number(item.line_total).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Extra Charges Section */}
                {modalDetails.extraCharges && modalDetails.extraCharges.length > 0 && (
                  <div style={{ margin: '12px 0' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                      Extra Charges
                    </div>
                    <table className="ledger" style={{ width: '100%', fontSize: 12.5 }}>
                      <tbody>
                        {modalDetails.extraCharges.map((charge) => (
                          <tr key={charge.id}>
                            <td>{charge.charge_type}</td>
                            <td className="num">₹{Number(charge.amount).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <hr style={{ border: 'none', borderTop: '1px dashed var(--line)', margin: '12px 0' }} />

                {/* Summary Table */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                  {Number(modalDetails.invoice.gst_rate) > 0 && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Subtotal:</span>
                        <span>₹{(Number(modalDetails.invoice.total_amount) - Number(modalDetails.invoice.gst_amount) - (modalDetails.extraCharges || []).reduce((s, c) => s + Number(c.amount), 0)).toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>CGST ({(modalDetails.invoice.gst_rate / 2).toFixed(2).replace(/\.00$/, '')}%):</span>
                        <span>₹{(Number(modalDetails.invoice.gst_amount) / 2).toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>SGST ({(modalDetails.invoice.gst_rate / 2).toFixed(2).replace(/\.00$/, '')}%):</span>
                        <span>₹{(Number(modalDetails.invoice.gst_amount) / 2).toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Grand Total:</span>
                    <strong style={{ fontSize: 15 }}>
                      ₹{Number(modalDetails.invoice.total_amount).toFixed(2)}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ledger-green)' }}>
                    <span>Amount Paid:</span>
                    <span>₹{Number(modalDetails.invoice.amount_paid).toFixed(2)}</span>
                  </div>
                  {Number(modalDetails.invoice.due_amount) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--rust)', fontWeight: 600 }}>
                      <span>Balance Due:</span>
                      <span>₹{Number(modalDetails.invoice.due_amount).toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span>Payment Status:</span>
                    <span className={`tag ${modalDetails.invoice.payment_status === 'Paid' ? 'tag-in' : 'tag-out'}`}>
                      {modalDetails.invoice.payment_status}
                    </span>
                  </div>
                  {modalDetails.invoice.is_deleted === 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span>Status:</span>
                      <span className="tag tag-out" style={{ fontWeight: 'bold' }}>
                        DELETED
                      </span>
                    </div>
                  )}
                </div>

                {/* Modal Footer Actions */}
                <div
                  style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}
                  className="no-print"
                >
                  {modalDetails.invoice.is_deleted === 1 ? (
                    <button
                      className="btn btn-whatsapp btn-sm"
                      style={{ backgroundColor: 'var(--ledger-green)', borderColor: 'var(--ledger-green)' }}
                      onClick={() => handleRestoreInvoice(modalDetails.invoice.id)}
                    >
                      ♻️ Restore Bill
                    </button>
                  ) : (
                    <>
                      <button
                        className="btn btn-whatsapp btn-sm"
                        onClick={() => handleWhatsAppShare(modalDetails.invoice.id)}
                      >
                        🟢 Send WhatsApp
                      </button>
                      <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
                        🖨️ Print Receipt
                      </button>
                    </>
                  )}
                  <button className="btn btn-secondary btn-sm" onClick={closeDetailsModal}>
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
