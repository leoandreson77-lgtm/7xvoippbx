import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '');
  const [agent, setAgent] = useState(() => JSON.parse(localStorage.getItem('agent') || sessionStorage.getItem('agent') || 'null'));
  const [extension, setExtension] = useState(() => JSON.parse(localStorage.getItem('extension') || sessionStorage.getItem('extension') || 'null'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function verifySession() {
      const storedToken = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch('/api/auth/session', {
          headers: { 'Authorization': `Bearer ${storedToken}` },
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.agent) {
            setAgent(data.agent);
            if (data.extension) setExtension(data.extension);
            localStorage.setItem('agent', JSON.stringify(data.agent));
            if (data.extension) localStorage.setItem('extension', JSON.stringify(data.extension));
          }
        } else {
          logout();
        }
      } catch (e) {
        /* best effort */
      } finally {
        setLoading(false);
      }
    }
    verifySession();
  }, []);

  function login(data) {
    setToken(data.token);
    setAgent(data.agent);
    setExtension(data.extension || null);

    localStorage.setItem('authToken', data.token);
    localStorage.setItem('agent', JSON.stringify(data.agent));
    if (data.extension) localStorage.setItem('extension', JSON.stringify(data.extension));

    sessionStorage.setItem('authToken', data.token);
    sessionStorage.setItem('agent', JSON.stringify(data.agent));
    if (data.extension) sessionStorage.setItem('extension', JSON.stringify(data.extension));
  }

  function logout() {
    try {
      fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: token ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } : { 'Content-Type': 'application/json' },
      });
    } catch (e) {}

    setToken('');
    setAgent(null);
    setExtension(null);
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace('/');
  }

  const getHeaders = () => {
    const h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  };

  return (
    <AuthContext.Provider value={{ token, agent, extension, loading, login, logout, getHeaders }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
