import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

export default function Register({ onToggleView }) {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [storeName, setStoreName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!storeName.trim() || !username.trim() || !password.trim() || !displayName.trim()) {
      setError('All fields are required.');
      return;
    }

    setBusy(true);
    try {
      await register(storeName.trim(), username.trim(), password.trim(), displayName.trim());
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          ShopSphere
          <small>SaaS Store Registration</small>
        </div>
        <form onSubmit={handleSubmit} style={{ marginTop: 22 }}>
          {error && <div className="error-banner">{error}</div>}
          <div className="field">
            <label htmlFor="storeName">Store / Shop Name</label>
            <input 
              id="storeName" 
              value={storeName} 
              onChange={(e) => setStoreName(e.target.value)} 
              placeholder="e.g. Apex Hardware"
              autoFocus 
            />
          </div>
          <div className="field">
            <label htmlFor="displayName">Owner's Full Name</label>
            <input 
              id="displayName" 
              value={displayName} 
              onChange={(e) => setDisplayName(e.target.value)} 
              placeholder="e.g. Raghav Agarwal"
            />
          </div>
          <div className="field">
            <label htmlFor="username">Owner's Username</label>
            <input 
              id="username" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              placeholder="e.g. raghav_owner"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input 
              id="password" 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="Min 6 characters"
            />
          </div>
          <br />
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Registering...' : 'Register & Start Store'}
          </button>
          
          <div style={{ marginTop: 18, textAlign: 'center', fontSize: 13, color: 'var(--text-dim)' }}>
            Already have a store?{' '}
            <button 
              type="button"
              onClick={onToggleView}
              style={{ background: 'none', border: 'none', color: 'var(--hazard)', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 'inherit', fontFamily: 'inherit' }}
            >
              Sign In
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
