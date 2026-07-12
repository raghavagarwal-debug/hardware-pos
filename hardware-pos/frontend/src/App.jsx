import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ProductsList from './pages/ProductsList.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import Reports from './pages/Reports.jsx';
import NewInvoice from './pages/NewInvoice.jsx';
import CustomerLedger from './pages/CustomerLedger.jsx';
import BillHistory from './pages/BillHistory.jsx';
import Settings from './pages/Settings.jsx';
import { applyTheme } from './utils/settings';

export default function App() {
  const { user, loading } = useAuth();

  useEffect(() => {
    applyTheme();
  }, []);

  if (loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!user) return <Login />;

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products" element={<ProductsList />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/billing" element={<NewInvoice />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/ledger-accounts" element={<CustomerLedger />} />
          <Route path="/bill-history" element={<BillHistory />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
