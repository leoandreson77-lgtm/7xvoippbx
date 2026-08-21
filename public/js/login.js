/**
 * Login Page Logic
 * Handles form submission, validation, and authentication.
 */
(function () {
  'use strict';

  const form = document.getElementById('loginForm');
  const extensionInput = document.getElementById('extension');
  const passwordInput = document.getElementById('password');
  const loginBtn = document.getElementById('loginBtn');
  const loginBtnText = document.getElementById('loginBtnText');
  const loginSpinner = document.getElementById('loginSpinner');
  const errorDiv = document.getElementById('loginError');
  const passwordToggle = document.getElementById('passwordToggle');

  let isLoading = false;

  // ── Password Toggle ─────────────────────────────
  passwordToggle.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    passwordToggle.textContent = isPassword ? '🙈' : '👁';
  });

  // ── Form Submission ─────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isLoading) return;

    const extension = extensionInput.value.trim();
    const password = passwordInput.value;

    // Client-side validation
    if (!extension || extension.length < 3) {
      showError('Please enter a valid extension number or email address');
      extensionInput.focus();
      return;
    }

    if (!password || password.length < 6) {
      showError('Password must be at least 6 characters');
      passwordInput.focus();
      return;
    }

    setLoading(true);
    hideError();

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ extension, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Store token across tabs and session
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('agent', JSON.stringify(data.agent));
      localStorage.setItem('extension', JSON.stringify(data.extension));
      sessionStorage.setItem('authToken', data.token);
      sessionStorage.setItem('agent', JSON.stringify(data.agent));
      sessionStorage.setItem('extension', JSON.stringify(data.extension));

      // Redirect based on role
      if (data.agent && data.agent.role === 'admin') {
        window.location.href = '/admin';
      } else {
        window.location.href = '/dashboard';
      }
    } catch (err) {
      showError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  });

  // ── UI Helpers ──────────────────────────────────
  function setLoading(loading) {
    isLoading = loading;
    loginBtn.disabled = loading;
    loginBtnText.textContent = loading ? 'Signing in...' : 'Sign In';
    loginSpinner.style.display = loading ? 'inline-block' : 'none';
    extensionInput.disabled = loading;
    passwordInput.disabled = loading;
  }

  function showError(message) {
    errorDiv.textContent = message;
    errorDiv.classList.add('visible');
  }

  function hideError() {
    errorDiv.classList.remove('visible');
  }

  // ── Check for existing session ──────────────────
  (async function checkSession() {
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    if (!token) return; // Stay on login page if not logged in

    try {
      const response = await fetch('/api/auth/session', {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        if (data.agent) {
          localStorage.setItem('agent', JSON.stringify(data.agent));
          if (data.extension) localStorage.setItem('extension', JSON.stringify(data.extension));
          sessionStorage.setItem('authToken', token);
          sessionStorage.setItem('agent', JSON.stringify(data.agent));
          if (data.extension) sessionStorage.setItem('extension', JSON.stringify(data.extension));

          if (data.agent.role === 'admin') {
            window.location.href = '/admin';
          } else {
            window.location.href = '/dashboard';
          }
        }
      } else {
        localStorage.clear();
        sessionStorage.clear();
      }
    } catch {
      // Stay on login page
    }
  })();
})();
