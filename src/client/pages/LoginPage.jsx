import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [extension, setExtension] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    const ext = extension.trim();
    const pass = password;

    if (!ext || ext.length < 3) {
      setErrorMessage('Please enter a valid extension number or email address');
      return;
    }

    if (!pass || pass.length < 6) {
      setErrorMessage('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ extension: ext, password: pass }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      login(data);

      if (data.agent && data.agent.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      {/* Animated Background */}
      <div className="login-bg">
        <div className="grid-pattern"></div>
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
      </div>

      {/* Login Card */}
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="login-logo">📞</div>
            <h1>7XVOIP</h1>
            <p>Sign in with your extension to start handling calls</p>
          </div>

          <form className="login-form" onSubmit={handleLogin} autoComplet="off">
            {/* Extension Input */}
            <div className="input-group">
              <label htmlFor="extension">Extension or Email</label>
              <div className="input-wrapper">
                <span className="input-icon">👤</span>
                <input
                  type="text"
                  id="extension"
                  value={extension}
                  onChange={(e) => setExtension(e.target.value)}
                  className="input-with-icon"
                  placeholder="Extension (1001) or Email"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="input-group">
              <label htmlFor="password">Password</label>
              <div className="input-wrapper">
                <span className="input-icon">🔒</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-with-icon"
                  placeholder="Enter your password"
                  minLength={6}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="login-error visible" role="alert" style={{ display: 'block' }}>
                {errorMessage}
              </div>
            )}

            {/* Login Button */}
            <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
              {!loading ? <span>Sign In</span> : <div className="spinner" style={{ display: 'inline-block' }}></div>}
            </button>
          </form>

          <div className="login-footer">
            <p>7XVOIP Communication Platform</p>
          </div>
        </div>
      </div>
    </div>
  );
}
