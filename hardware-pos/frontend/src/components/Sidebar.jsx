import { NavLink } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

export default function Sidebar() {
  const { user, logout, isOwner } = useAuth();

  return (
    <nav className="sidebar">
      <div className="brand">
        ShopSphere
        <small>Price &amp; Stock Ledger</small>
      </div>

      <div className="nav-group">
        <div className="nav-label">Operate</div>
        <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Dashboard</NavLink>
        <NavLink to="/products" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Products</NavLink>
        <NavLink to="/billing" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>New Bill</NavLink>
        <NavLink to="/bill-history" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Bill History</NavLink>
      </div>

      <div className="nav-group">
        <div className="nav-label">Audit</div>
        <NavLink to="/ledger-accounts" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Customer Ledger</NavLink>
        <NavLink to="/reports" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Reports</NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Settings</NavLink>
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
