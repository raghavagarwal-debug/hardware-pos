import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { formatWhatsAppNumber } from '../utils/phone';
import { useAuth } from '../AuthContext.jsx';

const menuStyle = {
  width: "100%",
  border: "none",
  background: "white",
  padding: "10px 14px",
  cursor: "pointer",
  textAlign: "left",
  fontSize: 14
};

export default function CustomerLedger() {
  const navigate = useNavigate();
  const { tenant } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [menuInvoice, setMenuInvoice] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  // Add Customer Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustNotes, setNewCustNotes] = useState('');
  const [addError, setAddError] = useState('');

  // Record Payment Modal State
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payRemarks, setPayRemarks] = useState('');
  const [payError, setPayError] = useState('');
  const [paying, setPaying] = useState(false);

  // Customer Notes State (for Auto-saving)
  const [notesText, setNotesText] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // Inactive customers filtering state
  const [inactiveMode, setInactiveMode] = useState(false);
  const [inactiveDays, setInactiveDays] = useState(60);
  const [inactiveCustomers, setInactiveCustomers] = useState([]);
  const [loadingInactive, setLoadingInactive] = useState(false);
  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadInactiveCustomers(daysVal) {
    setLoadingInactive(true);
    try {
      const targetDays = daysVal !== undefined ? daysVal : inactiveDays;
      const { customers: list } = await api.customers.inactive(targetDays);
      setInactiveCustomers(list);
    } catch (err) {
      console.error('Failed to load inactive customers:', err);
    } finally {
      setLoadingInactive(false);
    }
  }

  async function loadCustomers() {
    setLoading(true);
    try {
      const { customers: list } = await api.customers.list();
      setCustomers(list);

      // Keep selected customer details synced
      if (selectedCustomer) {
        const updated = list.find((c) => c.phone === selectedCustomer.phone);
        if (updated) {
          setSelectedCustomer(updated);
          setNotesText(updated.notes || '');
        }
      }

      if (inactiveMode) {
        await loadInactiveCustomers();
      }
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleEnableInactiveMode() {
    setInactiveMode(true);
    await loadInactiveCustomers(inactiveDays);
  }

  function handleDisableInactiveMode() {
    setInactiveMode(false);
    loadCustomers();
  }

  async function selectCustomer(cust) {
    setSelectedCustomer(cust);
    setNotesText(cust.notes || '');
    fetchLedger(cust.phone);
  }

  async function fetchLedger(phone) {
    setLedgerLoading(true);
    try {
      const data = await api.customers.get(phone);
      setLedger(data.ledger || []);
    } catch (err) {
      console.error('Failed to fetch ledger:', err);
    } finally {
      setLedgerLoading(false);
    }
  }

  async function handleAddCustomer(e) {
    e.preventDefault();
    setAddError('');
    if (!newCustName || !newCustPhone) {
      setAddError('Name and Phone number are required');
      return;
    }
    try {
      await api.customers.create({
        name: newCustName,
        phone: newCustPhone,
        notes: newCustNotes,
      });
      setNewCustName('');
      setNewCustPhone('');
      setNewCustNotes('');
      setShowAddModal(false);
      await loadCustomers();
    } catch (err) {
      setAddError(err.message || 'Failed to add customer.');
    }
  }

  async function handleRecordPayment(e) {
    e.preventDefault();
    setPayError('');
    if (!payAmount || Number(payAmount) <= 0) {
      setPayError('Please enter a valid payment amount');
      return;
    }
    setPaying(true);
    try {
      await api.customers.pay(selectedCustomer.phone, {
        amount: Number(payAmount),
        remarks: payRemarks,
      });
      setPayAmount('');
      setPayRemarks('');
      setShowPayModal(false);
      await loadCustomers();
      if (selectedCustomer) await fetchLedger(selectedCustomer.phone);
    } catch (err) {
      setPayError(err.message || 'Failed to record payment.');
    } finally {
      setPaying(false);
    }
  }

  async function handleDeletePayment(paymentId) {
    if (!window.confirm('Are you sure you want to delete this payment receipt? This will adjust the customer balance.')) return;
    try {
      await api.payments.delete(paymentId);
      await loadCustomers();
      if (selectedCustomer) await fetchLedger(selectedCustomer.phone);
    } catch (err) {
      alert('Failed to delete payment: ' + err.message);
    }
  }

  async function handleDeleteInvoice(invoiceId) {

    const confirmDelete = window.confirm(
      "Are you sure you want to delete this bill?\n\nThis will restore stock and remove the bill permanently."
    );

    if (!confirmDelete) return;

    try {

      await api.deleteInvoice(invoiceId);

      // Reload the entire customer data
      const data = await api.customers.get(selectedCustomer.phone);

      setSelectedCustomer(data.customer);
      setLedger(data.ledger || []);

      // Also refresh the customer list
      const { customers: list } = await api.customers.list();
      setCustomers(list);

      setMenuInvoice(null);

    } catch (err) {

      alert(err.message);

    }

  }

  async function handleDeleteCustomer() {
    if (!window.confirm(`Are you sure you want to delete "${selectedCustomer.name}"? This removes the ledger account but historical invoices will remain.`)) return;
    try {
      await api.customers.delete(selectedCustomer.phone);
      setSelectedCustomer(null);
      setLedger([]);
      await loadCustomers();
    } catch (err) {
      alert('Failed to delete customer: ' + err.message);
    }
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    try {
      await api.customers.update(selectedCustomer.phone, {
        notes: notesText,
      });
      // reload lists silently
      const { customers: list } = await api.customers.list();
      setCustomers(list);
      const match = list.find((c) => c.phone === selectedCustomer.phone);
      if (match) setSelectedCustomer(match);
    } catch (err) {
      alert('Failed to save notes: ' + err.message);
    } finally {
      setSavingNotes(false);
    }
  }


  async function openInvoice(invoiceId) {
    setMenuInvoice(null);
    try {
      setLoadingInvoice(true);

      const data = await api.invoice(invoiceId);

      setSelectedInvoice({
        ...data.invoice,
        items: data.items,
        extraCharges: data.extraCharges
      });

      setShowInvoiceModal(true);

    } catch (err) {
      alert(err.message);
    } finally {
      setLoadingInvoice(false);
    }
  }

  function handleExportExcel() {
    if (!selectedCustomer || ledger.length === 0) return;

    const headers = ['Date & Time', 'Type', 'Reference No', 'Total Bill (INR)', 'Amount Paid (INR)', 'Remaining Due (INR)', 'Remarks'];

    const rows = ledger.map((item) => {
      const dateStr = new Date(item.created_at).toLocaleString();
      const typeStr = item.type === 'invoice' ? 'Bill' : 'Payment';
      const refStr = item.ref_number;
      const totalBill = item.type === 'invoice' ? item.total_amount : 0;
      const paid = item.amount_paid;
      const due = item.type === 'invoice' ? (item.total_amount - item.amount_paid) : 0;
      // const remarks = item.remarks || '';
      return [dateStr, typeStr, refStr, totalBill, paid, due, remarks];
    });

    const csvString = [
      headers.join(','),
      ...rows.map((r) => r.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${selectedCustomer.name.replace(/\s+/g, '_')}_ledger.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleExportAllCustomers() {
    try {
      await api.customers.exportAll();
    } catch (err) {
      alert("Failed to export customers: " + err.message);
    }
  }

  async function handleSendBill(item) {
    try {
      const data = await api.invoiceWhatsApp(item.invoice_id);
      const formattedPhone = formatWhatsAppNumber(data.phone);
      if (!formattedPhone) {
        alert("Customer phone number is empty or invalid.");
        return;
      }
      const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(data.message)}`;
      window.open(url, "_blank");
    } catch (err) {
      alert("Failed to send bill: " + err.message);
    }
  }

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
  );

  const filteredInactiveCustomers = inactiveCustomers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
  );

  return (
    <div className="ledger-accounts-page">
      <div className="ledger-grid-container">

        {/* LEFT CUSTOMERS LIST PANELS */}
        <div className="card ledger-sidebar">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-display)' }}>Customer Ledger</span>
            <div style={{ display: "flex", gap: 8 }}>

              <button
                className="btn btn-secondary btn-sm"
                onClick={handleExportAllCustomers}
              >
                📥 Export All
              </button>

              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowAddModal(true)}
              >
                + Add Customer
              </button>

            </div>
          </div>

          <input
            placeholder="Search by name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid var(--line-strong)', borderRadius: 3, marginBottom: 10, width: '100%', fontSize: 13 }}
          />

          {inactiveMode ? (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button
                className="btn btn-secondary btn-sm"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, borderColor: 'var(--ledger-green)', color: 'var(--ledger-green)' }}
                onClick={handleDisableInactiveMode}
              >
                ⬅️ Back to All Customers
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button
                className="btn btn-secondary btn-sm"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                onClick={handleEnableInactiveMode}
              >
                👥 Inactive Customers
              </button>
              <select
                value={inactiveDays}
                onChange={(e) => setInactiveDays(Number(e.target.value))}
                style={{ padding: '4px 6px', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius)', fontSize: 12 }}
              >
                <option value={30}>30 Days</option>
                <option value={60}>60 Days</option>
                <option value={90}>90 Days</option>
                <option value={180}>180 Days</option>
                <option value={365}>1 Year</option>
              </select>
            </div>
          )}

          {inactiveMode ? (
            loadingInactive ? (
              <div className="empty-state">Loading inactive accounts...</div>
            ) : filteredInactiveCustomers.length === 0 ? (
              <div className="empty-state">No inactive customers found.</div>
            ) : (
              <div className="ledger-customer-list">
                {filteredInactiveCustomers.map((cust) => {
                  const isActive = selectedCustomer?.phone === cust.phone;
                  const hasDues = cust.outstanding_due > 0;
                  const lastPurchaseStr = cust.last_purchase
                    ? new Date(cust.last_purchase).toLocaleDateString()
                    : 'Never Purchased';
                  const inactiveDaysStr = cust.days_inactive !== null
                    ? `${cust.days_inactive} days inactive`
                    : 'Never purchased';

                  return (
                    <div
                      key={cust.phone}
                      className={`customer-ledger-card ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        const fullCust = customers.find(c => c.phone === cust.phone);
                        if (fullCust) {
                          selectCustomer(fullCust);
                        } else {
                          selectCustomer({
                            name: cust.name,
                            phone: cust.phone,
                            notes: '',
                            outstanding_dues: cust.outstanding_due || 0,
                            total_purchased: cust.total_purchased || 0,
                            total_paid: (cust.total_purchased || 0) - (cust.outstanding_due || 0),
                          });
                        }
                      }}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6, padding: '12px' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="cust-name">{cust.name}</div>
                        {hasDues ? (
                          <span className="badge badge-rust" style={{ fontSize: 9 }}>DUE ₹{Number(cust.outstanding_due).toFixed(0)}</span>
                        ) : (
                          <span className="badge tag-in" style={{ fontSize: 9 }}>PAID</span>
                        )}
                      </div>

                      <div style={{ fontSize: 11, color: isActive ? '#dbeafe' : 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div>📞 {cust.phone}</div>
                        <div>🛒 Total Purchased: <strong>₹{Number(cust.total_purchased || 0).toFixed(0)}</strong></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontWeight: 500 }}>
                          <span>📅 Last: {lastPurchaseStr}</span>
                          <span style={{ color: isActive ? '#fff' : 'var(--rust)', fontWeight: 'bold' }}>⚠️ {inactiveDaysStr}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            loading ? (
              <div className="empty-state">Loading accounts...</div>
            ) : filteredCustomers.length === 0 ? (
              <div className="empty-state">No customers found.</div>
            ) : (
              <div className="ledger-customer-list">
                {filteredCustomers.map((cust) => {
                  const isActive = selectedCustomer?.phone === cust.phone;
                  const hasDues = cust.outstanding_dues > 0;
                  return (
                    <div
                      key={cust.id}
                      className={`customer-ledger-card ${isActive ? 'active' : ''}`}
                      onClick={() => selectCustomer(cust)}
                    >
                      <div>
                        <div className="cust-name">{cust.name}</div>
                        <div className="cust-phone">{cust.phone}</div>
                      </div>
                      <div>
                        {hasDues ? (
                          <span className="badge badge-rust" style={{ fontSize: 10 }}>DUE ₹{cust.outstanding_dues.toFixed(0)}</span>
                        ) : (
                          <span className="badge tag-in" style={{ fontSize: 10 }}>PAID</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* RIGHT LEDGER DETAILS VIEW PANEL */}
        <div className="card ledger-detail-panel">
          {!selectedCustomer ? (
            <div className="empty-state" style={{ padding: 120 }}>
              <span style={{ fontSize: 32 }}>🧾</span>
              <h3 style={{ margin: '12px 0 6px 0' }}>No Customer Account Selected</h3>
              <p style={{ margin: 0, color: 'var(--text-dim)' }}>Select a customer from the left sidebar list to inspect their statement, record payments, or print accounts.</p>
            </div>
          ) : (
            <div>
              {/* Header */}
              <div className="ledger-detail-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--line)', paddingBottom: 16, marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="stat-icon customer-icon" style={{ width: 44, height: 44, fontSize: 20 }}>👥</div>
                  <div>
                    <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20 }}>{selectedCustomer.name}</h2>
                    <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 2 }}>📞 {selectedCustomer.phone}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btn btn-success btn-sm" onClick={() => setShowPayModal(true)}>
                    $ Paid (Record Payment)
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => navigate(`/billing?phone=${selectedCustomer.phone}`)}>
                    + New Bill
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ borderColor: 'var(--rust)', color: 'var(--rust)' }}
                    onClick={handleDeleteCustomer}
                    title="Delete Customer Account"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid-4" style={{ marginBottom: 20 }}>
                <div className="stat-card" style={{ border: '1px solid var(--line)', padding: 14, borderRadius: 4 }}>
                  <div className="stat-content">
                    <div className="stat-label" style={{ color: 'var(--rust)' }}>Total Outstanding Due</div>
                    <div className="stat-value" style={{ color: 'var(--rust)', fontSize: 20 }}>₹{selectedCustomer.outstanding_dues.toFixed(2)}</div>
                  </div>
                </div>
                <div className="stat-card" style={{ border: '1px solid var(--line)', padding: 14, borderRadius: 4 }}>
                  <div className="stat-content">
                    <div className="stat-label">Total Purchased</div>
                    <div className="stat-value" style={{ fontSize: 20 }}>₹{selectedCustomer.total_purchased.toFixed(2)}</div>
                  </div>
                </div>
                <div className="stat-card" style={{ border: '1px solid var(--line)', padding: 14, borderRadius: 4 }}>
                  <div className="stat-content">
                    <div className="stat-label" style={{ color: 'var(--ledger-green)' }}>Total Paid</div>
                    <div className="stat-value" style={{ color: 'var(--ledger-green)', fontSize: 20 }}>₹{selectedCustomer.total_paid.toFixed(2)}</div>
                  </div>
                </div>
                <div className="stat-card" style={{ border: '1px solid var(--line)', padding: 14, borderRadius: 4 }}>
                  <div className="stat-content">
                    <div className="stat-label">Last Activity</div>
                    <div className="stat-value" style={{ fontSize: 13, fontFamily: 'var(--font-mono)', marginTop: 8 }}>
                      {selectedCustomer.last_activity ? new Date(selectedCustomer.last_activity).toLocaleDateString() : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* History and Notes Row */}
              <div className="ledger-action-grid">

                {/* Ledger Transactions */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)' }}>Ledger Statement</h3>
                    {ledger.length > 0 && (
                      <button className="btn btn-secondary btn-sm" onClick={handleExportExcel}>
                        📥 Export to Excel (CSV)
                      </button>
                    )}
                  </div>

                  {ledgerLoading ? (
                    <div className="empty-state">Loading transactions statement...</div>
                  ) : ledger.length === 0 ? (
                    <div className="empty-state">No transaction records found for this account.</div>
                  ) : (
                    <div style={{ maxHeight: 380, overflowY: 'auto', overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 4 }}>
                      <table className="ledger" style={{ fontSize: 13 }}>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Details</th>
                            <th className="num">Due Change</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {ledger.map((item) => {
                            const isInv = item.type === 'invoice';
                            return (
                              <tr
                                key={`${item.type}-${item.id}`}
                                onClick={() => {
                                  if (isInv) {
                                    openInvoice(item.invoice_id);
                                  }
                                }}
                                style={{
                                  cursor: isInv ? "pointer" : "default"
                                }}
                                onMouseEnter={(e) => {
                                  if (isInv) e.currentTarget.style.backgroundColor = "#f8f9fa";
                                }}
                                onMouseLeave={(e) => {
                                  if (isInv) e.currentTarget.style.backgroundColor = "";
                                }}
                              >
                                <td style={{ verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                                  {new Date(item.created_at).toLocaleString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: true
                                  })}
                                </td>
                                <td style={{ verticalAlign: 'middle' }}>
                                  <span className={`tag ${isInv ? 'tag-out' : 'tag-in'}`} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4 }}>
                                    {isInv ? 'BILL' : 'PAYMENT'}
                                  </span>
                                </td>
                                <td style={{ verticalAlign: 'middle' }}>
                                  {isInv ? (
                                    <div>
                                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                                        Total: <strong>₹{item.total_amount.toFixed(2)}</strong> | Paid: <strong>₹{item.amount_paid.toFixed(2)}</strong>
                                      </div>
                                    </div>
                                  ) : (
                                    <div>
                                      {item.remarks && <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--text-dim)' }}>"{item.remarks}"</div>}
                                    </div>
                                  )}
                                </td>
                                <td className={`num ${isInv ? 'qty-out' : 'qty-in'}`} style={{ fontWeight: 600, verticalAlign: 'middle', fontSize: 14 }}>
                                  {isInv ? `+₹${(item.total_amount - item.amount_paid).toFixed(2)}` : `-₹${item.total_amount.toFixed(2)}`}
                                </td>
                                <td style={{ verticalAlign: 'middle', textAlign: 'right' }}>
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: 8,
                                      alignItems: "center",
                                      justifyContent: "flex-end"
                                    }}
                                  >
                                    {isInv && (
                                      <div style={{ position: "relative" }}>
                                        <button
                                          className="btn btn-sm"
                                          onClick={(e) => {
                                            e.stopPropagation();      // VERY IMPORTANT
                                            setMenuInvoice(menuInvoice?.id === item.id ? null : item);
                                          }}
                                        >
                                          ⋮
                                        </button>

                                        {menuInvoice?.id === item.id && !showInvoiceModal && (
                                          <div
                                            style={{
                                              position: "absolute",
                                              right: 0,
                                              top: 38,
                                              background: "#fff",
                                              border: "1px solid #ddd",
                                              borderRadius: 8,
                                              boxShadow: "0 8px 20px rgba(0,0,0,.15)",
                                              minWidth: 180,
                                              zIndex: 9999
                                            }}
                                          >

                                            <button
                                              className="dropdown-item"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleSendBill(item);
                                                setMenuInvoice(null);
                                              }}
                                              style={menuStyle}
                                            >
                                              🟢 WhatsApp
                                            </button>

                                            <button
                                              className="dropdown-item"
                                              onClick={() => {
                                                setMenuInvoice(null);

                                                setTimeout(() => {
                                                  openInvoice(item.id);
                                                }, 100);
                                              }}
                                              style={menuStyle}
                                            >
                                              👁 View Bill
                                            </button>

                                            <button
                                              className="dropdown-item"
                                              onClick={() => {
                                                window.print();
                                                setMenuInvoice(null);
                                              }}
                                              style={menuStyle}
                                            >
                                              🖨 Print
                                            </button>

                                            <button
                                              style={{
                                                ...menuStyle,
                                                color: "#d32f2f",
                                                fontWeight: 600
                                              }}
                                              onClick={(e) => {

                                                e.stopPropagation();

                                                handleDeleteInvoice(item.id);

                                              }}
                                            >
                                              🗑 Delete Bill
                                            </button>

                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {!isInv && (
                                      <button
                                        className="link-btn"
                                        style={{ color: 'var(--rust)', padding: 4 }}
                                        onClick={() => handleDeletePayment(item.id)}
                                        title="Delete Payment"
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)' }}>Customer Notes</h3>
                  <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <textarea
                      placeholder="Add specific follow-up details, billing address, or contractor notes here…"
                      value={notesText}
                      onChange={(e) => setNotesText(e.target.value)}
                      rows="8"
                      style={{ width: '100%', resize: 'none', border: '1px solid var(--line-strong)', borderRadius: 3, padding: 8, fontSize: 13, fontFamily: 'inherit' }}
                    />
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={handleSaveNotes}
                      disabled={savingNotes}
                      style={{ alignSelf: 'flex-end' }}
                    >
                      {savingNotes ? 'Saving…' : 'Save Notes'}
                    </button>
                  </div>
                </div>

              </div>

            </div>
          )}
        </div>
        {/* ADD CUSTOMER MODAL */}
        {showAddModal && (
          <div className="modal-backdrop">
            <div className="card modal-content" style={{ width: 420 }}>
              <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Create Customer Account</span>
                <button className="link-btn" onClick={() => setShowAddModal(false)} style={{ textDecoration: 'none', fontSize: 16 }}>✕</button>
              </div>
              {addError && <div className="error-banner">{addError}</div>}
              <form onSubmit={handleAddCustomer}>
                <div className="field">
                  <label>Customer Name</label>
                  <input required value={newCustName} onChange={(e) => setNewCustName(e.target.value)} placeholder="e.g. Amit Kumar" />
                </div>
                <div className="field">
                  <label>Phone Number (Unique)</label>
                  <input required value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} placeholder="e.g. 9876543210" />
                </div>
                <div className="field">
                  <label>Opening Notes (Optional)</label>
                  <textarea value={newCustNotes} onChange={(e) => setNewCustNotes(e.target.value)} placeholder="Address or contractor type details..." rows="3" style={{ resize: 'none', border: '1px solid var(--line-strong)', borderRadius: 3, padding: 8 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                  <button type="button" className="btn btn-sm" onClick={() => setShowAddModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary btn-sm">Create Account</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* RECORD STANDALONE PAYMENT MODAL */}
        {showPayModal && (
          <div className="modal-backdrop">
            <div className="card modal-content" style={{ width: 400 }}>
              <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Record Dues Collection</span>
                <button className="link-btn" onClick={() => setShowPayModal(false)} style={{ textDecoration: 'none', fontSize: 16 }}>✕</button>
              </div>
              {payError && <div className="error-banner">{payError}</div>}
              <form onSubmit={handleRecordPayment}>
                <div className="field">
                  <label>Amount Collected (₹)</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={selectedCustomer?.outstanding_dues || undefined}
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="field">
                  <label>Remarks / Payment Method</label>
                  <input value={payRemarks} onChange={(e) => setPayRemarks(e.target.value)} placeholder="e.g. Cash, GPay, Cheque #1002" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                  <button type="button" className="btn btn-sm" onClick={() => setShowPayModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-accent btn-sm" disabled={paying}>
                    {paying ? 'Recording…' : 'Confirm Payment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {showInvoiceModal && selectedInvoice && (
          <div
            className="modal-backdrop"
            onClick={() => {
              setShowInvoiceModal(false);
              setSelectedInvoice(null);
            }}
          >
            <div
              className="card modal-content receipt-modal"
              style={{
                background: "var(--paper-raised)",
                color: "var(--text)"
              }}
              onClick={(e) => e.stopPropagation()}
            >
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

              {/* Customer Details */}

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  fontSize: 13,
                  marginBottom: 16
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between"
                  }}
                >
                  <span>Date:</span>

                  <span>
                    {new Date(selectedInvoice.created_at).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true
                    })}
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between"
                  }}
                >
                  <span>Billed By:</span>

                  <span>{selectedInvoice.created_by}</span>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between"
                  }}
                >
                  <span>Customer:</span>

                  <strong>{selectedInvoice.customer_name}</strong>
                </div>

                {selectedInvoice.customer_phone && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between"
                    }}
                  >
                    <span>Phone:</span>

                    <span>{selectedInvoice.customer_phone}</span>
                  </div>
                )}
              </div>

              <hr
                style={{
                  border: "none",
                  borderTop: "1px dashed var(--line)",
                  margin: "12px 0"
                }}
              />

              {/* Purchased Items */}

              <div style={{ margin: "12px 0" }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    marginBottom: 8,
                    fontFamily: "var(--font-mono)",
                    textTransform: "uppercase"
                  }}
                >
                  Purchased Items
                </div>

                <div className="table-responsive">
                  <table
                    className="ledger"
                    style={{
                      width: "100%",
                      fontSize: 12.5
                    }}
                  >
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th className="num">Qty</th>
                        <th className="num">Rate</th>
                        <th className="num">Total</th>
                      </tr>
                    </thead>

                    <tbody>
                      {selectedInvoice.items.map((item) => (
                        <tr key={item.id}>
                          <td>{item.product_name}</td>

                          <td className="num">
                            {item.quantity}
                          </td>

                          <td className="num">
                            ₹{Number(item.selling_price).toFixed(2)}
                          </td>

                          <td className="num">
                            ₹{Number(item.line_total).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Extra Charges */}

              {selectedInvoice.extraCharges &&
                selectedInvoice.extraCharges.length > 0 && (
                  <>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 13,
                        marginBottom: 8,
                        fontFamily: "var(--font-mono)",
                        textTransform: "uppercase"
                      }}
                    >
                      Extra Charges
                    </div>

                    <div className="table-responsive">
                      <table
                        className="ledger"
                        style={{
                          width: "100%",
                          fontSize: 12.5
                        }}
                      >
                        <tbody>
                          {selectedInvoice.extraCharges.map((charge) => (
                            <tr key={charge.id}>
                              <td>{charge.charge_type}</td>

                              <td className="num">
                                ₹{Number(charge.amount).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

              <hr
                style={{
                  border: "none",
                  borderTop: "1px dashed var(--line)",
                  margin: "12px 0"
                }}
              />

              {/* Summary */}

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  fontSize: 13
                }}
              >
                {Number(selectedInvoice.gst_rate) > 0 && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Subtotal:</span>
                      <span>₹{(Number(selectedInvoice.total_amount) - Number(selectedInvoice.gst_amount) - (selectedInvoice.extraCharges || []).reduce((s, c) => s + Number(c.amount), 0)).toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>CGST ({(selectedInvoice.gst_rate / 2).toFixed(2).replace(/\.00$/, '')}%):</span>
                      <span>₹{(Number(selectedInvoice.gst_amount) / 2).toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>SGST ({(selectedInvoice.gst_rate / 2).toFixed(2).replace(/\.00$/, '')}%):</span>
                      <span>₹{(Number(selectedInvoice.gst_amount) / 2).toFixed(2)}</span>
                    </div>
                  </>
                )}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between"
                  }}
                >
                  <span>Grand Total:</span>

                  <strong style={{ fontSize: 15 }}>
                    ₹{Number(selectedInvoice.total_amount).toFixed(2)}
                  </strong>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: "var(--ledger-green)"
                  }}
                >
                  <span>Amount Paid:</span>

                  <span>
                    ₹{Number(selectedInvoice.amount_paid).toFixed(2)}
                  </span>
                </div>

                {Number(selectedInvoice.due_amount) > 0 && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      color: "var(--rust)",
                      fontWeight: 600
                    }}
                  >
                    <span>Balance Due:</span>

                    <span>
                      ₹{Number(selectedInvoice.due_amount).toFixed(2)}
                    </span>
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between"
                  }}
                >
                  <span>Payment Status:</span>

                  <span
                    className={`tag ${selectedInvoice.payment_status === "Paid"
                      ? "tag-in"
                      : "tag-out"
                      }`}
                  >
                    {selectedInvoice.payment_status}
                  </span>
                </div>
              </div>

              {/* Footer Buttons */}

              <div
                className="no-print"
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: 24
                }}
              >
                <button
                  className="btn btn-whatsapp btn-sm"
                  onClick={() =>
                    handleSendBill({
                      invoice_id: selectedInvoice.id
                    })
                  }
                >
                  🟢 Send WhatsApp
                </button>

                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => window.print()}
                >
                  🖨️ Print Receipt
                </button>

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setShowInvoiceModal(false);
                    setSelectedInvoice(null);
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
