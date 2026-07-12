import { useEffect, useState } from 'react';
import { api } from '../api';

const TXN_TYPES = [
  'New Stock Purchase', 'Sale', 'Customer Return', 'Supplier Return',
  'Manual Stock Adjustment', 'Damaged Item', 'Lost Item', 'Stock Correction', 'Opening Stock Entry',
];

export default function InventoryLedger() {
  const [products, setProducts] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ product: '', type: '', from: '', to: '', user: '', supplier: '' });

  useEffect(() => {
    api.products().then(({ products }) => setProducts(products));
  }, []);

  async function runSearch(e) {
    e?.preventDefault();
    setLoading(true);
    try {
      const cleanParams = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
      const { transactions } = await api.ledger(cleanParams);
      setRows(transactions);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { runSearch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function update(field, value) {
    setFilters((f) => ({ ...f, [field]: value }));
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Inventory Ledger</div>
          <div className="page-sub">Every stock movement across every product, fully searchable.</div>
        </div>
      </div>

      <div className="card">
        <form className="filters-bar" onSubmit={runSearch}>
          <div className="field">
            <label>Product</label>
            <select value={filters.product} onChange={(e) => update('product', e.target.value)}>
              <option value="">All products</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Type</label>
            <select value={filters.type} onChange={(e) => update('type', e.target.value)}>
              <option value="">All types</option>
              {TXN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label>From</label>
            <input type="date" value={filters.from} onChange={(e) => update('from', e.target.value)} />
          </div>
          <div className="field">
            <label>To</label>
            <input type="date" value={filters.to} onChange={(e) => update('to', e.target.value)} />
          </div>
          <div className="field">
            <label>User</label>
            <input value={filters.user} onChange={(e) => update('user', e.target.value)} placeholder="username" />
          </div>
          <div className="field">
            <label>Supplier</label>
            <input value={filters.supplier} onChange={(e) => update('supplier', e.target.value)} />
          </div>
          <button className="btn btn-primary btn-sm">Search</button>
        </form>

        {loading ? (
          <div className="empty-state">Loading transactions…</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">No transactions match these filters.</div>
        ) : (
          <table className="ledger">
            <thead>
              <tr>
                <th>Date &amp; Time</th>
                <th>Product</th>
                <th>Type</th>
                <th className="num">Qty</th>
                <th className="num">Prev → New</th>
                <th>User</th>
                <th>Reference</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>{new Date(t.created_at).toLocaleString()}</td>
                  <td>{t.product_name}</td>
                  <td><span className="tag">{t.transaction_type}</span></td>
                  <td className={`num ${t.quantity > 0 ? 'qty-in' : 'qty-out'}`}>{t.quantity > 0 ? `+${t.quantity}` : t.quantity}</td>
                  <td className="num">{t.previous_stock} → {t.updated_stock}</td>
                  <td>{t.performed_by}</td>
                  {/* <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{[t.invoice_number, t.supplier].filter(Boolean).join(' · ') || '—'}</td> */}
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t.remarks || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
