import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext.jsx';

const emptyForm = {
  name: '', unit: 'pcs', current_selling_price: '',
};

export default function ProductsList() {
  const { isOwner } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { products } = await api.products();
      setProducts(products);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await api.createProduct({
        ...form,
        current_selling_price: Number(form.current_selling_price) || 0,
      });
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This will hide it from the active catalog but preserve its historical sales ledger data.`)) return;
    try {
      await api.deleteProduct(id);
      load();
    } catch (err) {
      alert('Failed to delete product: ' + err.message);
    }
  }
  async function handleImportProducts(e) {

    const file = e.target.files[0];

    if (!file) return;

    setImporting(true);

    try {

      const result = await api.importProducts(file);

      alert(
        `Import Complete\n\nAdded : ${result.added}\nSkipped : ${result.skipped}`
      );

      load();

    } catch (err) {

      alert(err.message);

    } finally {

      setImporting(false);

      e.target.value = "";

    }

  }

  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Products</div>
          <div className="page-sub">Live prices &amp; stock, current as of your last refresh &mdash; every login pulls the latest.</div>
        </div>
        {isOwner && (

          <div style={{ display: "flex", gap: 10 }}>

            <button
              className="btn btn-secondary"
              onClick={() => fileInputRef.current.click()}
              disabled={importing}
            >
              {importing ? "Importing..." : "📥 Import Products"}
            </button>

            <button
              className="btn btn-primary"
              onClick={() => setShowForm(s => !s)}
            >
              {showForm ? "Close" : "+ Add Product"}
            </button>

            <input
              type="file"
              accept=".xlsx"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleImportProducts}
            />

          </div>

        )}
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="section-title">New product</div>
          {error && <div className="error-banner">{error}</div>}
          <form onSubmit={handleCreate}>
            <div className="field-row">
              <div className="field">
                <label>Name</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Unit</label>
                <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Selling price</label>
                <input type="number" step="0.01" value={form.current_selling_price} onChange={(e) => setForm({ ...form, current_selling_price: e.target.value })} />
              </div>
            </div>
            <button className="btn btn-accent">Save product</button>
          </form>
        </div>
      )}

      <div className="card">
        <input
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '9px 10px', border: '1px solid var(--line-strong)', borderRadius: 3, marginBottom: 14, width: 280 }}
        />
        {loading ? (
          <div className="empty-state">Loading products…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No products found.</div>
        ) : (
          <table className="ledger">
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Selling</th>
                <th>Last Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="num">
                    ₹{Number(p.current_selling_price || 0).toFixed(2)}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    {p.last_updated_date ? new Date(p.last_updated_date).toLocaleDateString() : '—'} by {p.last_updated_by || '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <Link className="link-btn" to={`/products/${p.id}`}>Open →</Link>
                      {isOwner && (
                        <button className="link-btn" style={{ color: 'var(--rust)', textDecoration: 'none' }} onClick={() => handleDelete(p.id, p.name)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
