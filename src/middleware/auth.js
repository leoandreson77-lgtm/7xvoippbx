const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const config = require('../config');
const { createLogger } = require('../utils/logger');

const prisma = new PrismaClient();
const log = createLogger('auth-middleware');

/**
 * Verify JWT from cookie or Authorization header.
 * Attaches req.agent with { id, extension, role }.
 */
async function authenticate(req, res, next) {
  try {
    const tokensToTry = [];

    // 1. Check Authorization header first (most accurate for SPAs)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const candidate = authHeader.slice(7).trim();
      if (candidate && candidate !== 'null' && candidate !== 'undefined') {
        tokensToTry.push(candidate);
      }
    }

    // 2. Add Cookie token as fallback
    if (req.cookies?.token && !tokensToTry.includes(req.cookies.token)) {
      tokensToTry.push(req.cookies.token);
    }

    if (tokensToTry.length === 0) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    let decoded = null;
    let lastError = null;

    for (const token of tokensToTry) {
      try {
        decoded = jwt.verify(token, config.jwt.secret);
        if (decoded) break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!decoded) {
      if (lastError?.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Session expired, please login again' });
      }
      return res.status(401).json({ error: 'Invalid session' });
    }

    // Verify agent still exists and is enabled
    const agent = await prisma.agent.findUnique({
      where: { id: decoded.agentId },
      select: { id: true, name: true, email: true, role: true, enabled: true, status: true },
    });

    if (!agent) {
      return res.status(401).json({ error: 'Agent not found' });
    }

    if (!agent.enabled) {
      return res.status(403).json({ error: 'Agent account is disabled' });
    }

    req.agent = {
      id: agent.id,
      name: agent.name,
      email: agent.email,
      extension: decoded.extension,
      role: agent.role,
      status: agent.status,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired, please login again' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid session' });
    }
    log.error('Authentication error', err.message);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Require admin role.
 */
function requireAdmin(req, res, next) {
  if (req.agent?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * Require specific roles.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.agent?.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { authenticate, requireAdmin, requireRole };
