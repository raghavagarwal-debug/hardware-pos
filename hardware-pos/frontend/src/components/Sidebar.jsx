import { NavLink } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout, isOwner } = useAuth();

  return (
    <nav className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="brand">
          ShopSphere
          <small>Price &amp; Stock Ledger</small>
        </div>
        <button className="sidebar-close-btn no-print" onClick={onClose} aria-label="Close sidebar">
          ✕
        </button>
      </div>

      <div className="nav-group">
        <div className="nav-label">Operate</div>
        <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} onClick={onClose}>Dashboard</NavLink>
        <NavLink to="/products" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} onClick={onClose}>Products</NavLink>
        <NavLink to="/billing" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} onClick={onClose}>New Bill</NavLink>
        <NavLink to="/bill-history" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} onClick={onClose}>Bill History</NavLink>
      </div>

      <div className="nav-group">
        <div className="nav-label">Audit</div>
        <NavLink to="/ledger-accounts" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} onClick={onClose}>Customer Ledger</NavLink>
        <NavLink to="/reports" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} onClick={onClose}>Reports</NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} onClick={onClose}>Settings</NavLink>
      </div>

      <div className="sidebar-footer">
        <span className="role-chip">{user?.role}</span>
        <div>{user?.display_name}</div>
        {!isOwner && <div style={{ color: 'var(--text-on-ink-dim)', fontSize: 11, marginTop: 4 }}>Prices are view-only for your account.</div>}
        <button className="logout-link" onClick={logout}>Log out</button>
      </div>
    </nav>
  );
}
