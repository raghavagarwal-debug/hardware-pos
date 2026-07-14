import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { applyTheme } from './utils/settings';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('hw_token');
    if (!token) { setLoading(false); return; }
    api.me()
      .then(({ user, tenant }) => {
        setUser(user);
        setTenant(tenant);
        if (tenant && tenant.theme) {
          applyTheme(tenant.theme);
        }
      })
      .catch(() => {
        localStorage.removeItem('hw_token');
        setUser(null);
        setTenant(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(username, password) {
    const { token, user, tenant } = await api.login(username, password);
    localStorage.setItem('hw_token', token);
    setUser(user);
    setTenant(tenant);
    if (tenant && tenant.theme) {
      applyTheme(tenant.theme);
    }
  }

  async function register(storeName, username, password, displayName) {
    const { token, user, tenant } = await api.register(storeName, username, password, displayName);
    localStorage.setItem('hw_token', token);
    setUser(user);
    setTenant(tenant);
    if (tenant && tenant.theme) {
      applyTheme(tenant.theme);
    }
  }

  function logout() {
    localStorage.removeItem('hw_token');
    setUser(null);
    setTenant(null);
    applyTheme('default');
  }

  function updateTenant(updatedTenant) {
    setTenant(updatedTenant);
    if (updatedTenant && updatedTenant.theme) {
      applyTheme(updatedTenant.theme);
    }
  }

  return (
    <AuthContext.Provider value={{
      user,
      tenant,
      loading,
      login,
      register,
      logout,
      updateTenant,
      isOwner: user?.role === 'owner'
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
