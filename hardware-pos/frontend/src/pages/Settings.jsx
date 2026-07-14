import { useState, useEffect } from 'react';
import { getSetting, setSetting, applyTheme } from '../utils/settings';
import { useAuth } from '../AuthContext';
import { api } from '../api';

const themes = [
  { id: 'default', name: 'Workshop Classic', colors: ['#191d20', '#efece4', '#dc9a2e'] },
  { id: 'dark', name: 'Sleek Dark Mode', colors: ['#0d0f11', '#12161a', '#efece4'] },
  { id: 'emerald', name: 'Forest Emerald', colors: ['#112d24', '#f0f4f2', '#1f6f54'] },
  { id: 'royal', name: 'Royal Midnight', colors: ['#101c34', '#f1f4f8', '#2a52be'] },
];

export default function Settings() {
  const { tenant, updateTenant, isOwner } = useAuth();
  
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

  // Staff management states
  const [users, setUsers] = useState([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState('worker');
  const [staffMessage, setStaffMessage] = useState('');
  const [staffMsgType, setStaffMsgType] = useState('success');

  // Load settings on mount
  useEffect(() => {
    if (tenant) {
      setShopName(tenant.name || '');
      setShopAddress(tenant.address || '');
      setShopPhone(tenant.phone || '');
      setShopGstin(tenant.gstin || '');
      setGstRate(Number(tenant.gst_rate || 0));
      setLowStockThreshold(Number(tenant.low_stock_threshold || 10));
      setPrintFormat(tenant.print_format || '80mm');
      setWhatsappTemplate(tenant.whatsapp_template || '');
      setSelectedTheme(tenant.theme || 'default');
    }
  }, [tenant]);

  // Load staff on mount if owner
  useEffect(() => {
    if (isOwner) {
      loadStaff();
    }
  }, [isOwner]);

  async function loadStaff() {
    try {
      const data = await api.getUsers();
      setUsers(data.users || []);
    } catch (err) {
      console.error(err);
    }
  }

  const handleSave = async (e) => {
    e.preventDefault();
    if (!isOwner) {
      setMessage('Only the store Owner can update settings.');
      setMsgType('error');
      return;
    }
    try {
      const response = await api.updateTenantSettings({
        name: shopName,
        address: shopAddress,
        phone: shopPhone,
        gstin: shopGstin,
        gst_rate: Number(gstRate),
        low_stock_threshold: Number(lowStockThreshold),
        print_format: printFormat,
        whatsapp_template: whatsappTemplate,
        theme: selectedTheme
      });
      
      updateTenant(response.tenant);
      setMessage('Settings saved successfully!');
      setMsgType('success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage('Failed to save settings: ' + err.message);
      setMsgType('error');
    }
  };

  async function handleAddStaff(e) {
    e.preventDefault();
    setStaffMessage('');
    if (!newUsername.trim() || !newPassword.trim() || !newDisplayName.trim()) {
      setStaffMessage('All staff fields are required.');
      setStaffMsgType('error');
      return;
    }
    try {
      await api.createUser({
        username: newUsername.trim(),
        password: newPassword.trim(),
        displayName: newDisplayName.trim(),
        role: newRole
      });
      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      setNewRole('worker');
      setStaffMessage('Staff member added successfully!');
      setStaffMsgType('success');
      loadStaff();
      setTimeout(() => setStaffMessage(''), 3000);
    } catch (err) {
      setStaffMessage('Failed to add staff: ' + err.message);
      setStaffMsgType('error');
    }
  }

  async function handleDeleteStaff(id) {
    if (!window.confirm('Are you sure you want to remove this staff member?')) return;
    try {
      await api.deleteUser(id);
      setStaffMessage('Staff member removed.');
      setStaffMsgType('success');
      loadStaff();
      setTimeout(() => setStaffMessage(''), 3000);
    } catch (err) {
      setStaffMessage('Failed to delete staff: ' + err.message);
      setStaffMsgType('error');
    }
  }

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
        <div className="settings-grid">
          
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

        <div className="settings-grid">
          
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
            <div className="theme-selector-grid">
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

      {isOwner && (
        <div className="card" style={{ marginTop: 30 }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            👥 Staff Management
          </h3>
          <p style={{ margin: '0 0 20px 0', fontSize: 12.5, color: 'var(--text-dim)' }}>
            Add and manage login credentials for your store's workers. Workers can register sales, view products, and perform transactions, but cannot view settings or delete records.
          </p>

          {staffMessage && (
            <div className={staffMsgType === 'success' ? 'success-banner' : 'error-banner'} style={{ padding: '12px 18px', marginBottom: 20, display: 'block', fontSize: 13.5, fontWeight: 500, borderRadius: 'var(--radius)' }}>
              {staffMsgType === 'success' ? '✅ ' : '❌ '}{staffMessage}
            </div>
          )}

          {/* Add Staff Member Form */}
          <form onSubmit={handleAddStaff} className="staff-form-grid">
            <div className="field" style={{ margin: 0 }}>
              <label style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dim)' }}>Worker Username</label>
              <input 
                required 
                value={newUsername} 
                onChange={(e) => setNewUsername(e.target.value)} 
                placeholder="e.g. jsmith_worker" 
                style={{ padding: 10, fontSize: 13 }} 
              />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dim)' }}>Full Name</label>
              <input 
                required 
                value={newDisplayName} 
                onChange={(e) => setNewDisplayName(e.target.value)} 
                placeholder="e.g. John Smith" 
                style={{ padding: 10, fontSize: 13 }} 
              />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dim)' }}>Password</label>
              <input 
                type="password" 
                required 
                value={newPassword} 
                onChange={(e) => setNewPassword(e.target.value)} 
                placeholder="Min 6 chars" 
                style={{ padding: 10, fontSize: 13 }} 
              />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dim)' }}>Role / Permission Level</label>
              <select 
                value={newRole} 
                onChange={(e) => setNewRole(e.target.value)} 
                style={{ padding: 10, fontSize: 13, borderRadius: 'var(--radius)', border: '1px solid var(--line-strong)', width: '100%' }}
              >
                <option value="worker">Worker (Standard)</option>
                <option value="worker1">Worker (Assistant)</option>
                <option value="worker2">Worker (Junior)</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary" style={{ padding: '10px 20px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', height: 40 }}>
              ➕ Add Staff
            </button>
          </form>

          {/* List of current staff members */}
          <h4 style={{ margin: '20px 0 10px 0', fontSize: 13, fontWeight: 600, color: 'var(--text-dim)' }}>Active Staff Members</h4>
          {users.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13, border: '1px dashed var(--line)', borderRadius: 'var(--radius)' }}>
              No staff members registered for this store. Use the form above to add workers.
            </div>
          ) : (
            <table className="ledger">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Full Name</th>
                  <th>Role</th>
                  <th style={{ width: 100, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.username}</strong></td>
                    <td>{u.display_name}</td>
                    <td>
                      <span className="tag tag-in" style={{ textTransform: 'capitalize' }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button 
                        type="button" 
                        className="btn btn-secondary btn-sm" 
                        onClick={() => handleDeleteStaff(u.id)}
                        style={{ borderColor: 'var(--rust)', color: 'var(--rust)', padding: '4px 8px', fontSize: 11 }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
