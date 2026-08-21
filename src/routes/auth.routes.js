const express = require('express');
const authService = require('../services/auth.service');
const { loginLimiter } = require('../middleware/rateLimiter');
const { authenticate } = require('../middleware/auth');
const { isValidExtension, isValidPassword, sanitize } = require('../utils/validators');
const config = require('../config');

const router = express.Router();

/**
 * POST /api/auth/login
 * Authenticate agent with extension number + password.
 */
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const extension = sanitize(req.body.extension);
    const password = req.body.password;

    // Validate input
    const isEmail = extension.includes('@');
    if (!extension || (!isEmail && !isValidExtension(extension))) {
      return res.status(400).json({ error: 'Valid extension number or email required' });
    }
    if (!password || !isValidPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const ip = req.ip || req.connection?.remoteAddress || '';
    const result = await authService.login(extension, password, ip);

    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';

    // Set JWT as HttpOnly cookie
    res.cookie('token', result.token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      success: true,
      token: result.token, // Also return in body for WebSocket auth
      agent: result.agent,
      extension: result.extension,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/logout
 * Logout agent, invalidate session, set offline.
 */
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const ip = req.ip || '';
    await authService.logout(req.agent.id, ip);

    res.clearCookie('token');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/session
 * Validate current session and return agent info.
 */
router.get('/session', authenticate, (req, res) => {
  res.json({
    authenticated: true,
    agent: req.agent,
    extension: req.agent.extension ? { number: req.agent.extension } : null,
  });
});

/**
 * GET /api/auth/sip-credentials
 * Return SIP credentials (HA1 + WSS config) for WebRTC registration.
 * Authenticated only. Never returns plaintext SIP password.
 */
router.get('/sip-credentials', authenticate, async (req, res, next) => {
  try {
    const credentials = await authService.getSipCredentials(req.agent.id);
    res.json(credentials);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
