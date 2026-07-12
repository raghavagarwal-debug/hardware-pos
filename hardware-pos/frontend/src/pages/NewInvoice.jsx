import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { formatWhatsAppNumber } from '../utils/phone';
import { useAuth } from '../AuthContext.jsx';
import { getSetting } from '../utils/settings';

export default function NewInvoice() {
  const [searchParams] = useSearchParams();
  const phoneParam = searchParams.get('phone');
  const { isOwner } = useAuth();

  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customer, setCustomer] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [lines, setLines] = useState([{ product_id: '', quantity: 1, selling_price: '' }]);
  const [paymentStatus, setPaymentStatus] = useState('Paid');
  const [amountPaid, setAmountPaid] = useState('');
  const [error, setError] = useState('');
  const [invoice, setInvoice] = useState(null);
  const [extraCharges, setExtraCharges] = useState([]);

  // Editing invoice state
  const [editingInvoiceId, setEditingInvoiceId] = useState(null);
  // const [editingInvoiceNumber, setEditingInvoiceNumber] = useState('');

  // Search and autocomplete state
  const [customerSearchQuery, setCustomerSearchQuery] = useState('Walk-in Customer');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [productSearchQueries, setProductSearchQueries] = useState({});
  const [activeProductDropdown, setActiveProductDropdown] = useState(null);

  // Edit product modal state
  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', unit: '', current_selling_price: '' });
  // Create Product Modal
  const [showCreateProductModal, setShowCreateProductModal] = useState(false);

  const [newProduct, setNewProduct] = useState({
    name: "",
    unit: "pcs",
    current_selling_price: ""
  });

  const [creatingProduct, setCreatingProduct] = useState(false);

  const [createProductError, setCreateProductError] = useState("");
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Refs for click outside
  const customerRef = useRef(null);
  const lineRefs = useRef({});

  // Handlers for product editing
  function openEditModal(p) {
    setEditingProduct(p);
    setEditForm({
      name: p.name,
      unit: p.unit || 'pcs',
      current_selling_price: p.current_selling_price
    });
    setEditError('');
  }

  async function handleSaveProductEdit(e) {
    e.preventDefault();
    setEditError('');
    setEditSaving(true);
    try {
      const updated = await api.updateProduct(editingProduct.id, {
        name: editForm.name,
        unit: editForm.unit,
        current_selling_price: Number(editForm.current_selling_price)
      });

      // Update local state products list:
      setProducts(prev => prev.map(prod => prod.id === editingProduct.id ? updated.product : prod));

      // Update active lines with updated product price
      setLines(prev => prev.map(l => {
        if (Number(l.product_id) === Number(editingProduct.id)) {
          return { ...l, selling_price: updated.product.current_selling_price };
        }
        return l;
      }));

      setEditingProduct(null);
    } catch (err) {
      setEditError(err.message || 'Failed to update product');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleCreateProduct(e) {

    e.preventDefault();

    setCreateProductError("");

    if (!newProduct.name.trim()) {
      setCreateProductError("Product name is required.");
      return;
    }

    if (
      Number(newProduct.current_selling_price) <= 0
    ) {
      setCreateProductError("Enter a valid selling price.");
      return;
    }

    try {

      setCreatingProduct(true);

      const result = await api.createProduct({

        name: newProduct.name.trim(),

        unit: newProduct.unit,

        current_selling_price: Number(
          newProduct.current_selling_price
        ),

      });

      // Refresh products
      // Refresh products from backend
      const response = await api.products();
      const createdProduct = result.product;
      setProducts(response.products);
      updateLine(
        lines.length - 1,
        "product_id",
        createdProduct.id
      );

      // Newly created product


      // Automatically select it in the last billing row
      setLines(prev => {

        const updated = [...prev];

        const last = updated.length - 1;

        updated[last] = {

          ...updated[last],

          product_id: createdProduct.id,

          quantity: 1,
          selling_price: createdProduct.current_selling_price,

        };

        return updated;

      });

      // Show its name in the search box
      setProductSearchQueries(prev => {

        const updated = { ...prev };

        updated[lines.length - 1] = createdProduct.name;

        return updated;

      });

      // Close popup
      setShowCreateProductModal(false);

      // Reset form
      setNewProduct({
        name: "",
        unit: "pcs",
        current_selling_price: "",
      });

    }

    catch (err) {

      setCreateProductError(err.message);

    }

    finally {

      setCreatingProduct(false);

    }

  }

  function handleEditBill() {
    if (!invoice || !invoice.invoice) return;
    const inv = invoice.invoice;
    setEditingInvoiceId(inv.id);
    // setEditingInvoiceNumber(inv.invoice_number);

    // Set lines
    setLines(invoice.items.map(it => ({
      product_id: it.product_id,
      quantity: it.quantity,
      selling_price: it.selling_price
    })));

    // Set customer details
    setCustomer(inv.customer_name);
    setCustomerPhone(inv.customer_phone || '');
    if (inv.customer_phone) {
      setCustomerSearchQuery(`${inv.customer_name} (${inv.customer_phone})`);
    } else {
      setCustomerSearchQuery(inv.customer_name || 'Walk-in Customer');
    }

    // Set payment
    setPaymentStatus(inv.payment_status);
    setAmountPaid(inv.payment_status === 'Due' ? inv.amount_paid.toString() : '');

    // Set extra charges
    setExtraCharges(invoice.extraCharges || []);

    // Hide preview to show editing form
    setInvoice(null);
  }

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event) {
      if (customerRef.current && !customerRef.current.contains(event.target)) {
        setShowCustomerDropdown(false);
      }
      if (activeProductDropdown !== null) {
        const ref = lineRefs.current[activeProductDropdown];
        if (ref && !ref.contains(event.target)) {
          setActiveProductDropdown(null);
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeProductDropdown]);


  function removeLine(idx) {
    setLines((ls) => ls.filter((_, i) => i !== idx));
  }

  function addCharge() {
    setExtraCharges((prev) => [
      ...prev,
      {
        charge_type: "",
        amount: ""
      }
    ]);
  }

  function updateCharge(index, field, value) {
    setExtraCharges((prev) =>
      prev.map((charge, i) =>
        i === index
          ? { ...charge, [field]: value }
          : charge
      )
    );
  }


  function removeCharge(index) {
    setExtraCharges((prev) =>
      prev.filter((_, i) => i !== index)
    );
  }

  useEffect(() => {
    api.products().then(({ products }) => setProducts(products));
    api.customers.list().then(({ customers }) => {
      setCustomers(customers);
      if (phoneParam) {
        const matching = customers.find(c => c.phone === phoneParam);
        if (matching) {
          setCustomer(matching.name);
          setCustomerPhone(matching.phone);
          setCustomerSearchQuery(`${matching.name} (${matching.phone})`);
        } else {
          setCustomerPhone(phoneParam);
          setCustomerSearchQuery('Walk-in / New Customer');
        }
      } else {
        setCustomerSearchQuery('Walk-in Customer');
      }
    });
  }, [phoneParam]);

  function updateLine(idx, field, value) {
    setLines((ls) =>
      ls.map((l, i) => {
        if (i === idx) {
          const updated = { ...l, [field]: value };
          if (field === 'product_id') {
            const p = products.find((prod) => prod.id === Number(value));
            updated.selling_price = p ? p.current_selling_price : '';
          }
          return updated;
        }
        return l;
      })
    );
  }

  function addLine() {
    setLines((ls) => [...ls, { product_id: '', quantity: 1, selling_price: '' }]);
  }

  function removeLine(idx) {
    setLines((ls) => ls.filter((_, i) => i !== idx));
  }

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  const total = lines.reduce((sum, l) => {
    const p = productMap[l.product_id];
    return sum + (p ? Number(l.selling_price || 0) * Number(l.quantity || 0) : 0);
  }, 0);
  const extraTotal = extraCharges.reduce(
    (sum, charge) => sum + Number(charge.amount || 0),
    0
  );
  const grandTotal = Number((total + extraTotal).toFixed(2));

  const paidAmount = Number(
    (
      paymentStatus === "Paid"
        ? grandTotal
        : Number(amountPaid || 0)
    ).toFixed(2)
  );

  const dueAmount = Number((grandTotal - paidAmount).toFixed(2));



  async function submit(e) {
    console.log("Generate Bill clicked");
    e.preventDefault();
    setError('');
    setInvoice(null);

    for (const l of lines) {
      if (l.product_id) {
        const priceNum = Number(l.selling_price);
        if (isNaN(priceNum) || priceNum <= 0) {
          setError('Selling price must be a valid number greater than zero');
          return;
        }
        const qtyNum = Number(l.quantity);
        if (isNaN(qtyNum) || qtyNum <= 0) {
          setError('Quantity must be a valid number greater than zero');
          return;
        }
      }
    }

    const items = lines
      .filter((l) => l.product_id && Number(l.quantity) > 0)
      .map((l) => ({
        product_id: Number(l.product_id),
        quantity: Number(l.quantity),
        selling_price: Number(l.selling_price)
      }));

    if (items.length === 0) {
      setError('Add at least one valid line item');
      return;
    }

    const calculatedPaid = paymentStatus === 'Paid' ? total : (Number(amountPaid) || 0);

    try {
      let result;
      const payload = {
        customer_name: customer,
        customer_phone: customerPhone,
        items,
        payment_status: paymentStatus,
        amount_paid: calculatedPaid,
        extraCharges
      };

      if (editingInvoiceId) {
        result = await api.updateInvoice(editingInvoiceId, payload);
      } else {
        result = await api.createInvoice(payload);
      }

      setInvoice(result);
      setLines([{ product_id: '', quantity: 1, selling_price: '' }]);
      setCustomer('Walk-in Customer');
      setCustomerPhone('');
      setCustomerSearchQuery('Walk-in Customer');
      setPaymentStatus('Paid');
      setAmountPaid('');
      setEditingInvoiceId(null);
      // setEditingInvoiceNumber('');

      const { products: refreshed } = await api.products();
      setProducts(refreshed);
      api.customers.list().then(({ customers }) => setCustomers(customers));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleWhatsAppShare() {
    if (!invoice || !invoice.invoice) return;
    try {
      const data = await api.invoiceWhatsApp(invoice.invoice.id);
      const formattedPhone = formatWhatsAppNumber(data.phone);
      if (!formattedPhone) {
        alert("Customer phone number is empty or invalid.");
        return;
      }
      const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(data.message)}`;
      window.open(url, "_blank");
    } catch (err) {
      alert("Failed to send bill to WhatsApp: " + err.message);
    }
  }

  return (
    <div>
      <div className="page-header no-print">
        <div>
          <div className="page-title">New Bill</div>
          <div className="page-sub">Bills always use the current selling price at the moment of sale, then lock it in forever.</div>
        </div>
      </div>

      {error && <div className="error-banner no-print">{error}</div>}

      {invoice && (
        <div className="card print-receipt-container" style={{ borderColor: 'var(--ledger-green)', maxWidth: 600, margin: '0 auto 20px auto' }}>
          <div className="receipt-header" style={{ textAlign: 'center', marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--ledger-green)' }}>
              {getSetting('shop_name', 'ShopSphere')}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {getSetting('shop_address', 'Jamshedpur')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              Phone: {getSetting('shop_phone', '+91 1234567890')}
            </div>
            {getSetting('shop_gstin', '') && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                GSTIN: {getSetting('shop_gstin', '')}
              </div>
            )}
            <hr style={{ border: 'none', borderTop: '1px dashed var(--line)', margin: '12px 0' }} />
            <h3 style={{ margin: '4px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ESTIMATE</h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: 13, gap: '8px 16px', marginBottom: 16 }}>
            <div><strong>Customer:</strong> {invoice.invoice.customer_name}</div>
            <div style={{ textAlign: 'right' }}><strong>Date:</strong> {new Date(invoice.invoice.created_at).toLocaleString()}</div>
            <div><strong>Billed By:</strong> {invoice.invoice.created_by}</div>
          </div>

          <table className="ledger" style={{ marginBottom: 16 }}>
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Qty</th>
                <th className="num">Rate</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((it) => (
                <tr key={it.id}>
                  <td>{it.product_name}</td>
                  <td className="num">{it.quantity}</td>
                  <td className="num">₹{it.selling_price.toFixed(2)}</td>
                  <td className="num">₹{it.line_total.toFixed(2)}</td>
                </tr>
              ))}
              {invoice.extraCharges?.length > 0 && (
                <>
                  <tr>
                    <td colSpan="4">
                      <hr />
                    </td>
                  </tr>
                  {invoice.extraCharges.map((charge) => (
                    <tr key={charge.id}>
                      <td colSpan="3">
                        {charge.charge_type}
                      </td>

                      <td className="num">
                        ₹{Number(charge.amount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>



          <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 12, fontSize: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>Total Amount:</span>
              <strong style={{ fontSize: 16 }}>₹{invoice.invoice.total_amount.toFixed(2)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--ledger-green)' }}>
              <span>Amount Paid:</span>
              <span>₹{invoice.invoice.amount_paid.toFixed(2)}</span>
            </div>
            {invoice.invoice.total_amount - invoice.invoice.amount_paid > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--rust)', fontWeight: 600 }}>
                <span>Balance Due:</span>
                <span>₹{(invoice.invoice.total_amount - invoice.invoice.amount_paid).toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
              <span>Status:</span>
              <span className={`tag ${invoice.invoice.payment_status === 'Paid' ? 'tag-in' : 'tag-out'}`} style={{ textTransform: 'uppercase' }}>
                {invoice.invoice.payment_status}
              </span>
            </div>
          </div>

          <div className="receipt-footer" style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--text-dim)' }}>
            <hr style={{ border: 'none', borderTop: '1px dashed var(--line)', margin: '12px 0' }} />
            <div>Thank you for shopping with us!</div>
            <div style={{ fontWeight: 600, marginTop: 4 }}>Have a nice day!</div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }} className="no-print">
            <button className="btn btn-whatsapp" onClick={handleWhatsAppShare}>
              🟢 Send to WhatsApp
            </button>
            <button className="btn btn-primary" onClick={() => window.print()}>
              🖨️ Print Receipt
            </button>
            <button className="btn btn-secondary" style={{ borderColor: 'var(--ledger-green)', color: 'var(--ledger-green)' }} onClick={handleEditBill}>
              ✏️ Edit Bill
            </button>
            <button className="btn btn-secondary" onClick={() => setInvoice(null)}>
              Create Another Bill
            </button>
          </div>
        </div>
      )
      }

      {
        !invoice && (
          <div className="card no-print">
            <form onSubmit={submit}>
              {editingInvoiceId && (
                <div style={{ padding: '12px 16px', background: 'var(--ledger-green-dim)', border: '1px solid var(--ledger-green)', borderRadius: 'var(--radius)', marginBottom: 20, color: 'var(--ledger-green)', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>✏️ Editing Bill</span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', color: 'inherit', fontWeight: 'bold' }}
                    onClick={() => {
                      setEditingInvoiceId(null);
                      // setEditingInvoiceNumber('');
                      setLines([{ product_id: '', quantity: 1, selling_price: '' }]);
                      setCustomer('Walk-in Customer');
                      setCustomerPhone('');
                      setCustomerSearchQuery('Walk-in Customer');
                      setPaymentStatus('Paid');
                      setAmountPaid('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
              <div className="field-row" style={{ marginBottom: 16 }}>
                <div className="field search-dropdown-container" style={{ flex: 1 }} ref={customerRef}>
                  <label>Link to Customer Account (Search)</label>
                  <input
                    type="text"
                    style={{ width: '100%' }}
                    value={customerSearchQuery}
                    onFocus={() => setShowCustomerDropdown(true)}
                    onChange={(e) => {
                      setCustomerSearchQuery(e.target.value);
                      setShowCustomerDropdown(true);
                    }}
                    placeholder="Search by customer name or phone..."
                  />
                  {showCustomerDropdown && (
                    <div className="search-dropdown-menu">
                      <div
                        className="search-dropdown-item select-header"
                        onClick={() => {
                          setCustomer('Walk-in Customer');
                          setCustomerPhone('');
                          setCustomerSearchQuery('Walk-in Customer');
                          setShowCustomerDropdown(false);
                        }}
                      >
                        <em>-- New Customer / Walk-in --</em>
                      </div>
                      {customers
                        .filter((c) => {
                          const q = customerSearchQuery.toLowerCase();
                          if (q === '' || q === 'walk-in customer') return true;
                          return (
                            c.name.toLowerCase().includes(q) ||
                            c.phone.toLowerCase().includes(q)
                          );
                        })
                        .map((c) => (
                          <div
                            key={c.phone}
                            className="search-dropdown-item"
                            onClick={() => {
                              setCustomer(c.name);
                              setCustomerPhone(c.phone);
                              setCustomerSearchQuery(`${c.name} (${c.phone})`);
                              setShowCustomerDropdown(false);
                            }}
                          >
                            <strong>{c.name}</strong> ({c.phone})
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Customer Name</label>
                  <input
                    required
                    value={customer}
                    onChange={(e) => {
                      setCustomer(e.target.value);
                      setCustomerSearchQuery(e.target.value);
                    }}
                    placeholder="Walk-in Customer"
                  />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Customer Phone (for Dues/Ledger)</label>
                  <input
                    value={customerPhone}
                    onChange={(e) => {
                      setCustomerPhone(e.target.value);
                      const match = customers.find(c => c.phone === e.target.value);
                      if (match) {
                        setCustomer(match.name);
                        setCustomerSearchQuery(`${match.name} (${match.phone})`);
                      } else {
                        setCustomerSearchQuery(customer || 'Walk-in Customer');
                      }
                    }}
                    placeholder="Enter phone number"
                  />
                </div>
              </div>

              <div className="section-title" style={{ marginTop: 18 }}>Line items</div>
              {lines.map((line, idx) => {
                const p = productMap[line.product_id];
                return (
                  <div key={idx} style={{ borderBottom: '1px dashed var(--line)', paddingBottom: 16, marginBottom: 16 }}>
                    <div className="field-row" style={{ alignItems: 'flex-start' }}>
                      <div className="field search-dropdown-container" style={{ flex: 20 }} ref={(el) => (lineRefs.current[idx] = el)}>
                        <label>Product</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <div style={{ flex: 1, position: 'relative', width: '100%' }}>
                            <input
                              type="text"
                              style={{ width: '100%' }}
                              placeholder="Search product name..."
                              value={
                                productSearchQueries[idx] !== undefined
                                  ? productSearchQueries[idx]
                                  : (p ? p.name : '')
                              }
                              onFocus={() => setActiveProductDropdown(idx)}
                              onChange={(e) => {
                                const val = e.target.value;
                                setProductSearchQueries(prev => ({ ...prev, [idx]: val }));
                                setActiveProductDropdown(idx);
                              }}
                            />
                            {activeProductDropdown === idx && (
                              <div className="search-dropdown-menu">
                                {products
                                  .filter((prod) => {
                                    const q = (productSearchQueries[idx] || '').toLowerCase();
                                    return prod.name.toLowerCase().includes(q);
                                  })
                                  .map((prod) => (
                                    <div
                                      key={prod.id}
                                      className="search-dropdown-item"
                                      onClick={() => {
                                        updateLine(idx, 'product_id', prod.id);
                                        setProductSearchQueries(prev => {
                                          const next = { ...prev };
                                          delete next[idx];
                                          return next;
                                        });
                                        setActiveProductDropdown(null);
                                      }}
                                    >
                                      <strong>{prod.name}</strong>
                                    </div>
                                  ))}
                                {products.filter((prod) => {
                                  const q = (productSearchQueries[idx] || '').toLowerCase();
                                  return prod.name.toLowerCase().includes(q);
                                }).length === 0 && (
                                    <div className="search-dropdown-item select-header">
                                      No products found
                                    </div>
                                  )}
                              </div>
                            )}
                          </div>
                          {p && (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '9px 12px' }}
                              onClick={() => openEditModal(p)}
                              title="Edit Product Details"
                            >
                              ✏️
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="field" style={{ flex: 1 }}>
                        <label>Qty</label>
                        <input type="number" min="1" value={line.quantity}
                          onChange={(e) => updateLine(idx, 'quantity', e.target.value)} />
                      </div>
                      <div className="field" style={{ flex: 1 }}>
                        <label>Selling Price</label>
                        <input type="number" min="0.01" step="0.01" value={line.selling_price}
                          onChange={(e) => updateLine(idx, 'selling_price', e.target.value)} />
                      </div>
                      <div className="field" style={{ flex: 1 }}>
                        <label>Line total</label>
                        <div className="num" style={{ padding: '9px 0' }}>
                          {p ? `₹${(Number(line.selling_price || 0) * Number(line.quantity || 0)).toFixed(2)}` : '—'}
                        </div>
                      </div>
                      {lines.length > 1 && (
                        <button type="button" className="btn btn-sm" style={{ marginTop: 22 }} onClick={() => removeLine(idx)}>Remove</button>
                      )}
                    </div>
                    {p && (
                      <div
                        style={{
                          display: "flex",
                          gap: 20,
                          marginBottom: 8,
                          marginTop: -8,
                          marginLeft: 0,
                        }}
                      >
                        <div
                          style={{
                            flex: 1,
                            background: "#fafafa",
                            border: "1px solid #ddd",
                            borderRadius: 8,
                            padding: 10,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              color: "#777",
                              textTransform: "uppercase",
                              marginRight: 10,
                            }}
                          >
                            Last Price:
                          </span>
                          <strong
                            style={{
                              fontSize: 16,
                              color: "#1565c0",
                            }}
                          >
                            ₹
                            {p.last_selling_price
                              ? Number(p.last_selling_price || 0).toFixed(2)
                              : "--"}
                          </strong>
                        </div>

                        <div
                          style={{
                            flex: 1,
                            background: "#fafafa",
                            border: "1px solid #ddd",
                            borderRadius: 8,
                            padding: 10,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              color: "#777",
                              textTransform: "uppercase",
                              marginRight: 10,
                            }}
                          >
                            Prev Price:
                          </span>
                          <strong
                            style={{
                              fontSize: 16,
                              color: "#d84315",
                            }}
                          >
                            ₹
                            {p.previous_selling_price
                              ? Number(p.previous_selling_price || 0).toFixed(2)
                              : "--"}
                          </strong>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  marginBottom: 20,
                }}
              >

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setShowCreateProductModal(true)}
                >
                  + Create New Product
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={addLine}
                >
                  + Add Line
                </button>

              </div>




              <div className="section-title" style={{ marginTop: 18 }}>
                Additional Charges
              </div>

              {extraCharges.map((charge, index) => (
                <div
                  key={index}
                  className="field-row"
                  style={{ alignItems: "center" }}
                >
                  <div className="field" style={{ flex: 2 }}>
                    <label>Charge Type</label>

                    <select
                      value={charge.charge_type}
                      onChange={(e) =>
                        updateCharge(index, "charge_type", e.target.value)
                      }
                    >
                      <option value="">Select Charge</option>
                      <option value="Transport">Transport</option>
                      <option value="Labour">Labour</option>
                      <option value="Loading">Loading</option>
                      <option value="Delivery">Delivery</option>
                      <option value="Packing">Packing</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="field" style={{ flex: 1 }}>
                    <label>Amount</label>

                    <input
                      type="number"
                      value={charge.amount}
                      onChange={(e) =>
                        updateCharge(index, "amount", e.target.value)
                      }
                      placeholder="₹0"
                    />
                  </div>

                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => removeCharge(index)}
                  >
                    Remove
                  </button>
                </div>
              ))}

              <button
                type="button"
                className="btn btn-sm"
                onClick={addCharge}
                style={{ marginBottom: 20 }}
              >
                + Add Charge
              </button>

              {/* Payment Section */}
              <div className="payment-options" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div className="field">
                  <label>Payment Mode / Status</label>
                  <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
                    <option value="Paid">Fully Paid</option>
                    <option value="Due">Contains Dues</option>
                  </select>
                </div>
                {paymentStatus === 'Due' && (
                  <div className="field">
                    <label>Amount Paid Upfront (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={total}
                      value={amountPaid}
                      placeholder="0.00"
                      onChange={(e) => setAmountPaid(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: "1px solid var(--line)",
                  paddingTop: 16,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontSize: 16, marginBottom: 6 }}>
                    <strong>Subtotal:</strong> ₹{total.toFixed(2)}
                  </div>

                  <div style={{ fontSize: 16, marginBottom: 6 }}>
                    <strong>Extra Charges:</strong> ₹{extraTotal.toFixed(2)}
                  </div>

                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      color: "#1b5e20",
                    }}
                  >
                    Grand Total: ₹{grandTotal.toFixed(2)}
                    {paymentStatus === "Due" && (
                      <>
                        <div
                          style={{
                            fontSize: 16,
                            marginTop: 10,
                            color: "#2e7d32",
                          }}
                        >
                          <strong>Amount Paid:</strong> ₹{paidAmount.toFixed(2)}
                        </div>

                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: "bold",
                            color: "#d32f2f",
                            marginTop: 6,
                          }}
                        >
                          Outstanding Due: ₹{dueAmount.toFixed(2)}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  {editingInvoiceId && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ height: 48, fontSize: 18 }}
                      onClick={() => {
                        setEditingInvoiceId(null);
                        // setEditingInvoiceId('');
                        setLines([{ product_id: '', quantity: 1, selling_price: '' }]);
                        setCustomer('Walk-in Customer');
                        setCustomerPhone('');
                        setCustomerSearchQuery('Walk-in Customer');
                        setPaymentStatus('Paid');
                        setAmountPaid('');
                      }}
                    >
                      Cancel Edit
                    </button>
                  )}
                  <button
                    className="btn btn-accent"
                    style={{
                      minWidth: 180,
                      height: 48,
                      fontSize: 18,
                    }}
                  >
                    {editingInvoiceId ? 'Update Bill' : 'Generate Bill'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )
      }

      {editingProduct && (
        <div className="modal-backdrop">
          <div className="card modal-content" style={{ width: '100%', maxWidth: 450, background: 'var(--paper-raised)', color: 'var(--text)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>Edit Product Info</h3>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setEditingProduct(null)}
                style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', color: 'var(--text)' }}
              >
                ✕
              </button>
            </div>

            {editError && <div className="error-banner" style={{ marginBottom: 12 }}>{editError}</div>}

            <form onSubmit={handleSaveProductEdit}>
              <div className="field">
                <label>Product Name</label>
                <input
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Unit (e.g. pcs, box, kg)</label>
                <input
                  required
                  value={editForm.unit}
                  onChange={(e) => setEditForm(prev => ({ ...prev, unit: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Current Selling Price (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  disabled={!isOwner}
                  value={editForm.current_selling_price}
                  onChange={(e) => setEditForm(prev => ({ ...prev, current_selling_price: e.target.value }))}
                />
                {!isOwner && <small style={{ color: 'var(--text-dim)' }}>Only the Owner can update the selling price</small>}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingProduct(null)}
                  disabled={editSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-accent"
                  disabled={editSaving}
                >
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showCreateProductModal && (
        <div className="modal-backdrop">
          <div
            className="card modal-content"
            style={{
              width: "100%",
              maxWidth: 500,
              background: "var(--paper-raised)"
            }}
          >

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16
              }}
            >
              <h3>Create New Product</h3>

              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setShowCreateProductModal(false)}
              >
                ✕
              </button>
            </div>

            {createProductError && (
              <div
                className="error-banner"
                style={{ marginBottom: 15 }}
              >
                {createProductError}
              </div>
            )}

            <form onSubmit={handleCreateProduct}>

              <div className="field">
                <label>Product Name</label>

                <input
                  required
                  value={newProduct.name}
                  onChange={(e) =>
                    setNewProduct({
                      ...newProduct,
                      name: e.target.value
                    })
                  }
                />
              </div>

              <div className="field">
                <label>Selling Price</label>

                <input
                  required
                  type="number"
                  step="0.01"
                  value={newProduct.current_selling_price}
                  onChange={(e) =>
                    setNewProduct({
                      ...newProduct,
                      current_selling_price: e.target.value
                    })
                  }
                />
              </div>

              <div className="field">
                <label>Unit</label>

                <select
                  value={newProduct.unit}
                  onChange={(e) =>
                    setNewProduct({
                      ...newProduct,
                      unit: e.target.value
                    })
                  }
                >
                  <option value="pcs">pcs</option>
                  <option value="box">box</option>
                  <option value="coil">coil</option>
                  <option value="kg">kg</option>
                  <option value="meter">meter</option>
                  <option value="feet">feet</option>
                  <option value="bag">bag</option>
                  <option value="bundle">bundle</option>
                  <option value="packet">packet</option>
                  <option value="roll">roll</option>
                </select>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: 20
                }}
              >

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateProductModal(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn btn-accent"
                  disabled={creatingProduct}
                >
                  {creatingProduct
                    ? "Saving..."
                    : "Save Product"}
                </button>

              </div>

            </form>

          </div>
        </div>
      )}


    </div >
  );
}
