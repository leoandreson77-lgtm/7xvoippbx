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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SipProvider>
          <App />
        </SipProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
