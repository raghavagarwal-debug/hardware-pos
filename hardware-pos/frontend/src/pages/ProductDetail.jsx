import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext.jsx';

const TXN_TYPES = [
  'New Stock Purchase', 'Sale',
];

const TAG_CLASS = {
  'New Stock Purchase': 'tag-in', 'Opening Stock Entry': 'tag-in',
  Sale: 'tag-out',
};

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isOwner, user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [priceForm, setPriceForm] = useState({ current_selling_price: '', market_price: '', dealer_price: '', reason: '' });
  const [txnForm, setTxnForm] = useState({ transaction_type: 'New Stock Purchase', quantity: '', remarks: '', supplier: '' });

  async function handleDelete() {
    if (!window.confirm(`Are you sure you want to delete "${data?.product?.name}"? This will archive it and hide it from the active list.`)) return;
    try {
      await api.deleteProduct(id);
      navigate('/products');
    } catch (err) {
      setError(err.message);
    }
  }

  async function load() {
    const result = await api.product(id);
    setData(result);
    setPriceForm({
      current_selling_price: result.product.current_selling_price,
      market_price: result.product.market_price,
      dealer_price: result.product.dealer_price ?? '',
      reason: '',
    });
  }

  useEffect(() => { load(); }, [id]);

  async function submitPrice(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      await api.updatePrice(id, {
        current_selling_price: Number(priceForm.current_selling_price),
        market_price: Number(priceForm.market_price),
        dealer_price: priceForm.dealer_price === '' ? null : Number(priceForm.dealer_price),
        reason: priceForm.reason,
      });
      setSuccess('Price updated. This takes effect immediately for all users and all new bills.');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitTxn(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      await api.recordTransaction({
        product_id: Number(id),
        transaction_type: txnForm.transaction_type,
        quantity: Number(txnForm.quantity),
        remarks: txnForm.remarks,
        supplier: txnForm.supplier,
      });
      setSuccess('Stock transaction recorded.');
      setTxnForm({ transaction_type: 'New Stock Purchase', quantity: '', remarks: '', supplier: '' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!data) return <div className="empty-state">Loading…</div>;
  const { product, priceHistory, inventoryTimeline } = data;

  return (
    <div>
      <div className="page-header">
        <div>
          <Link className="link-btn" to="/products">← All products</Link>
          <div className="page-title" style={{ marginTop: 6 }}>{product.name}</div>
          <div className="page-sub">{product.category || 'Uncategorized'} · Stock on hand: <strong>{product.current_stock} {product.unit}</strong></div>
        </div>
        {isOwner && (
          <button className="btn btn-secondary" style={{ borderColor: 'var(--rust)', color: 'var(--rust)' }} onClick={handleDelete}>
            Delete Product
          </button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <div className="grid-2">
        {/* ---------------- Price Management ---------------- */}
        <div className="card">
          <div className="section-title">Price Management</div>
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <div className="stat">
              <div className="stat-label">Last selling price</div>
              <div className="stat-value num">{product.last_selling_price != null ? `₹${product.last_selling_price.toFixed(2)}` : '—'}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Previous selling price</div>
              <div className="stat-value num">{product.previous_selling_price != null ? `₹${product.previous_selling_price.toFixed(2)}` : '—'}</div>
            </div>
          </div>

          {isOwner ? (
            <form onSubmit={submitPrice}>
              <div className="field-row">
                <div className="field">
                  <label>Current selling price</label>
                  <input type="number" step="0.01" value={priceForm.current_selling_price}
                    onChange={(e) => setPriceForm({ ...priceForm, current_selling_price: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label>Reason for change (optional)</label>
                <input value={priceForm.reason} onChange={(e) => setPriceForm({ ...priceForm, reason: e.target.value })} placeholder="e.g. supplier rate increase" />
              </div>
              <button className="btn btn-accent">Save price update</button>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 10 }}>
                Old invoices already billed at the previous price are never changed.
              </div>
            </form>
          ) : (
            <div className="empty-state" style={{ padding: '16px 0' }}>
              Only the Owner can update prices. You're viewing live, read-only prices as {user?.display_name}.
            </div>
          )}
        </div>

        {/* ---------------- Manual stock transaction ---------------- */}
        <div className="card">
          <div className="section-title">Record a Stock Transaction</div>
          <form onSubmit={submitTxn}>
            <div className="field-row">
              <div className="field">
                <label>Transaction type</label>
                <select value={txnForm.transaction_type} onChange={(e) => setTxnForm({ ...txnForm, transaction_type: e.target.value })}>
                  {TXN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Quantity</label>
                <input type="number" min="1" value={txnForm.quantity} onChange={(e) => setTxnForm({ ...txnForm, quantity: e.target.value })} required />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Supplier (optional)</label>
                <input value={txnForm.supplier} onChange={(e) => setTxnForm({ ...txnForm, supplier: e.target.value })} />
              </div>
              <div className="field">
                <label>Remarks</label>
                <input value={txnForm.remarks} onChange={(e) => setTxnForm({ ...txnForm, remarks: e.target.value })} placeholder="Optional note" />
              </div>
            </div>
            <button className="btn btn-primary">Record transaction</button>
          </form>
        </div>
      </div>

      {/* ---------------- Price history ---------------- */}
      <div className="card">
        <div className="section-title">Price History</div>
        {priceHistory.length === 0 ? (
          <div className="empty-state">No price changes recorded yet.</div>
        ) : (
          <table className="ledger">
            <thead>
              <tr>
                <th>Date &amp; Time</th>
                <th>Field</th>
                <th className="num">Old Price</th>
                <th className="num">New Price</th>
                <th>Updated By</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {priceHistory.map((h) => (
                <tr key={h.id}>
                  <td className="num">{new Date(h.created_at).toLocaleString()}</td>
                  <td>{h.field_changed === 'both' ? 'Selling + Market' : h.field_changed.replace('_', ' ')}</td>
                  <td className="num">{h.old_price != null ? `₹${h.old_price.toFixed(2)}` : '—'}</td>
                  <td className="num">
                    {h.new_price != null ? (
                      <span className={h.new_price > h.old_price ? 'price-delta price-up' : 'price-delta price-down'}>
                        ₹{h.new_price.toFixed(2)} {h.new_price > h.old_price ? '▲' : '▼'}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="num">{h.new_market_price != null ? `₹${h.new_market_price.toFixed(2)}` : (h.old_market_price != null ? `₹${h.old_market_price.toFixed(2)}` : '—')}</td>
                  <td>{h.updated_by}</td>
                  <td>{h.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ---------------- Inventory timeline ---------------- */}
      <div className="card">
        <div className="section-title">Inventory Timeline</div>
        {inventoryTimeline.length === 0 ? (
          <div className="empty-state">No stock movements recorded yet.</div>
        ) : (
          <div className="timeline">
            {inventoryTimeline.map((t) => (
              <div className="timeline-row" key={t.id}>
                <div className="timeline-date">{new Date(t.created_at).toLocaleDateString()}</div>
                <div className={t.quantity > 0 ? 'qty-in' : 'qty-out'}>{t.quantity > 0 ? `+${t.quantity}` : t.quantity}</div>
                <div>
                  <span className={`tag ${TAG_CLASS[t.transaction_type] || ''}`}>{t.transaction_type}</span>
                  {' '}
                  {t.remarks && <span style={{ color: 'var(--text-dim)' }}>{t.remarks}</span>}
                  {/* {t.invoice_number && <span style={{ color: 'var(--text-dim)' }}> · {t.invoice_number}</span>} */}
                  {t.supplier && <span style={{ color: 'var(--text-dim)' }}> · {t.supplier}</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t.previous_stock} → {t.updated_stock} · {t.performed_by}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
