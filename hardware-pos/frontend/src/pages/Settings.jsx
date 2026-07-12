import { useState, useEffect } from 'react';
import { getSetting, setSetting, applyTheme } from '../utils/settings';

const themes = [
  { id: 'default', name: 'Workshop Classic', colors: ['#191d20', '#efece4', '#dc9a2e'] },
  { id: 'dark', name: 'Sleek Dark Mode', colors: ['#0d0f11', '#12161a', '#efece4'] },
  { id: 'emerald', name: 'Forest Emerald', colors: ['#112d24', '#f0f4f2', '#1f6f54'] },
  { id: 'royal', name: 'Royal Midnight', colors: ['#101c34', '#f1f4f8', '#2a52be'] },
];

export default function Settings() {
  const [shopName, setShopName] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [shopGstin, setShopGstin] = useState('');
  
  const [gstRate, setGstRate] = useState(0);
  const [lowStockThreshold, setLowStockThreshold] = useState(10);
  const [printFormat, setPrintFormat] = useState('80mm');
  
  const [whatsappTemplate, setWhatsappTemplate] = useState('');
  const [selectedTheme, setSelectedTheme] = useState('default');
  
  const [message, setMessage] = useState('');
  const [msgType, setMsgType] = useState('success');

  // Load settings on mount
  useEffect(() => {
    setShopName(getSetting('shop_name', 'ShopSphere'));
    setShopAddress(getSetting('shop_address', 'Jamshedpur'));
    setShopPhone(getSetting('shop_phone', '+91 1234567890'));
    setShopGstin(getSetting('shop_gstin', ''));
    setGstRate(Number(getSetting('gst_rate', 0)));
    setLowStockThreshold(Number(getSetting('low_stock_threshold', 10)));
    setPrintFormat(getSetting('print_format', '80mm'));
    setWhatsappTemplate(getSetting('whatsapp_template', 'Dear {customer_name},\n\nThank you for shopping with us! Here are your bill details:\nTotal Amount: ₹{total_amount}\nAmount Paid: ₹{amount_paid}\nDue: ₹{due_amount}\n\nHave a great day!'));
    setSelectedTheme(getSetting('theme', 'default'));
  }, []);

  const handleSave = (e) => {
    e.preventDefault();
    try {
      setSetting('shop_name', shopName);
      setSetting('shop_address', shopAddress);
      setSetting('shop_phone', shopPhone);
      setSetting('shop_gstin', shopGstin);
      setSetting('gst_rate', Number(gstRate));
      setSetting('low_stock_threshold', Number(lowStockThreshold));
      setSetting('print_format', printFormat);
      setSetting('whatsapp_template', whatsappTemplate);
      setSetting('theme', selectedTheme);
      
      // Apply theme changes instantly
      applyTheme();
      
      setMessage('Settings saved successfully!');
      setMsgType('success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      // Auto-clear success message after 3 seconds
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage('Failed to save settings: ' + err.message);
      setMsgType('error');
    }
  };

  const handleThemeSelect = (themeId) => {
    setSelectedTheme(themeId);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Store Settings</div>
          <div className="page-sub">Configure invoice templates, receipts, alerts, and system visual styling.</div>
        </div>
      </div>

      {message && (
        <div className={msgType === 'success' ? 'tag tag-in' : 'error-banner'} style={{ padding: '12px 18px', marginBottom: 20, display: 'block', fontSize: 13.5, fontWeight: 500, borderRadius: 'var(--radius)' }}>
          {msgType === 'success' ? '✅ ' : '❌ '}{message}
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          
          {/* SHOP PROFILE */}
          <div className="card">
            <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              🏪 Shop Profile
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dim)' }}>Shop / Business Name</label>
                <input required value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="e.g. Apex Hardware" style={{ padding: 10, fontSize: 13 }} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dim)' }}>Address / Location</label>
                <input required value={shopAddress} onChange={(e) => setShopAddress(e.target.value)} placeholder="e.g. Sector-4, Jamshedpur" style={{ padding: 10, fontSize: 13 }} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dim)' }}>Contact Phone Number</label>
                <input required value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} placeholder="e.g. +91 9876543210" style={{ padding: 10, fontSize: 13 }} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dim)' }}>GSTIN / Tax Registration Number</label>
                <input value={shopGstin} onChange={(e) => setShopGstin(e.target.value)} placeholder="e.g. 22AAAAA0000A1Z5 (Optional)" style={{ padding: 10, fontSize: 13 }} />
              </div>
            </div>
          </div>

          {/* SYSTEM CONFIGURATIONS */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              ⚙️ Billing & Inventory
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dim)' }}>Default GST / Tax Rate (%)</label>
                <input type="number" min="0" max="100" required value={gstRate} onChange={(e) => setGstRate(e.target.value)} style={{ padding: 10, fontSize: 13 }} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dim)' }}>Low Stock Warning Limit</label>
                <input type="number" min="1" required value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} style={{ padding: 10, fontSize: 13 }} />
                <small style={{ fontSize: 11, color: 'var(--text-dim)' }}>Products with stock levels below this limit will trigger alert badges.</small>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dim)' }}>Default Print Layout</label>
                <select value={printFormat} onChange={(e) => setPrintFormat(e.target.value)} style={{ padding: 10, fontSize: 13, borderRadius: 'var(--radius)', border: '1px solid var(--line-strong)', width: '100%' }}>
                  <option value="80mm">Thermal Receipt (80mm Width)</option>
                  <option value="58mm">Compact Thermal Receipt (58mm Width)</option>
                  <option value="A4">Standard Invoice Page (A4 Paper)</option>
                </select>
              </div>
            </div>
          </div>

        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          
          {/* WHATSAPP TEMPLATE */}
          <div className="card">
            <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              💬 WhatsApp Share Template
            </h3>
            <div className="field" style={{ margin: 0 }}>
              <label style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dim)' }}>Message Template</label>
              <textarea 
                rows="6" 
                required 
                value={whatsappTemplate} 
                onChange={(e) => setWhatsappTemplate(e.target.value)} 
                style={{ width: '100%', resize: 'none', padding: 10, fontSize: 13, fontFamily: 'inherit', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius)' }} 
              />
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                You can use dynamic placeholders:
                <br />
                - <strong>{`{customer_name}`}</strong>: Replaced by customer name
                <br />
                - <strong>{`{total_amount}`}</strong>: Replaced by the total bill amount
                <br />
                - <strong>{`{amount_paid}`}</strong>: Replaced by the payment received
                <br />
                - <strong>{`{due_amount}`}</strong>: Replaced by outstanding balance
              </div>
            </div>
          </div>

          {/* THEMES & VISUALS */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              🎨 Appearance Theme
            </h3>
            <p style={{ margin: '0 0 14px 0', fontSize: 12.5, color: 'var(--text-dim)' }}>Choose a styling theme that matches your store brand. Clicking a theme selects it; click "Save Settings" below to apply.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flex: 1 }}>
              {themes.map((theme) => {
                const isActive = selectedTheme === theme.id;
                return (
                  <div
                    key={theme.id}
                    onClick={() => handleThemeSelect(theme.id)}
                    style={{
                      border: isActive ? '2px solid var(--hazard)' : '1px solid var(--line)',
                      borderRadius: 'var(--radius)',
                      padding: '14px',
                      cursor: 'pointer',
                      background: 'var(--paper)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 12,
                      boxShadow: isActive ? '0 0 8px rgba(220,154,46,0.15)' : 'none',
                      transition: 'border-color 0.2s'
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.borderColor = 'var(--line-strong)'; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.borderColor = 'var(--line)'; }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                      {theme.name}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {theme.colors.map((c, index) => (
                        <span
                          key={index}
                          style={{
                            display: 'inline-block',
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            backgroundColor: c,
                            border: '1px solid rgba(0,0,0,0.15)'
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', padding: '12px 24px', fontSize: 14, minWidth: 150, fontWeight: 700 }}>
          💾 Save Settings
        </button>
      </form>
    </div>
  );
}
