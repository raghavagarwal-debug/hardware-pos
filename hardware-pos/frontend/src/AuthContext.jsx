import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('hw_token');
    if (!token) { setLoading(false); return; }
    api.me()
      .then(({ user }) => setUser(user))
      .catch(() => { localStorage.removeItem('hw_token'); })
      .finally(() => setLoading(false));
  }, []);

  async function login(username, password) {
    const { token, user } = await api.login(username, password);
    localStorage.setItem('hw_token', token);
    setUser(user);
  }

  function logout() {
    localStorage.removeItem('hw_token');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isOwner: user?.role === 'owner' }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
