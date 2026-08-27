import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '../../public/css/variables.css';
import '../../public/css/login.css';
import '../../public/css/dashboard.css';
import '../../public/css/admin.css';
import { AuthProvider } from './context/AuthContext';
import { SipProvider } from './context/SipContext';
import App from './App';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', background: '#0a0e1a', color: '#fff', minHeight: '100vh', fontFamily: 'sans-serif', textAlign: 'center' }}>
          <h2 style={{ color: '#ef4444', marginBottom: '12px' }}>Something went wrong loading the application</h2>
          <p style={{ color: '#94a3b8', marginBottom: '24px' }}>{this.state.error?.message || String(this.state.error)}</p>
          <button
            onClick={() => { localStorage.clear(); sessionStorage.clear(); window.location.replace('/'); }}
            style={{ padding: '10px 24px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}
          >
            Clear Cache & Re-login
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <SipProvider>
            <App />
          </SipProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
