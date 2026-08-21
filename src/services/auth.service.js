const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const config = require('../config');
const { comparePassword } = require('../utils/crypto');
const { createLogger } = require('../utils/logger');
const { AGENT_STATUS, AUDIT_ACTIONS } = require('../constants');

const prisma = new PrismaClient();
const log = createLogger('auth-service');

/**
 * Authenticate an agent by extension number and password.
 * Returns { token, agent, extension } on success.
 */
async function login(identifier, password, ip) {
  let agent = null;
  let extension = null;

  if (identifier.includes('@')) {
    // Login via Email (e.g. for Admins or Agents)
    agent = await prisma.agent.findUnique({
      where: { email: identifier },
      include: { extension: true },
    });

    if (!agent) {
      await auditLog(null, AUDIT_ACTIONS.LOGIN_FAILED, `Email ${identifier} not found`, ip);
      throw createError(401, 'Invalid extension/email or password');
    }

    if (!agent.enabled) {
      await auditLog(agent.id, AUDIT_ACTIONS.LOGIN_FAILED, `Agent ${agent.name} disabled`, ip);
      throw createError(403, 'Account is disabled. Contact administrator.');
    }

    extension = agent.extension;
    if (extension && !extension.enabled) {
      await auditLog(agent.id, AUDIT_ACTIONS.LOGIN_FAILED, `Extension ${extension.number} disabled`, ip);
      throw createError(403, 'Extension is disabled. Contact administrator.');
    }
  } else {
    // Login via Extension Number
    extension = await prisma.extension.findUnique({
      where: { number: identifier },
      include: { agent: true },
    });

    if (!extension) {
      await auditLog(null, AUDIT_ACTIONS.LOGIN_FAILED, `Extension ${identifier} not found`, ip);
      throw createError(401, 'Invalid extension/email or password');
    }

    if (!extension.enabled) {
      await auditLog(extension.agentId, AUDIT_ACTIONS.LOGIN_FAILED, `Extension ${identifier} disabled`, ip);
      throw createError(403, 'Extension is disabled. Contact administrator.');
    }

    if (!extension.agent) {
      await auditLog(null, AUDIT_ACTIONS.LOGIN_FAILED, `Extension ${identifier} has no agent`, ip);
      throw createError(401, 'No agent assigned to this extension');
    }

    agent = extension.agent;

    if (!agent.enabled) {
      await auditLog(agent.id, AUDIT_ACTIONS.LOGIN_FAILED, `Agent ${agent.name} disabled`, ip);
      throw createError(403, 'Account is disabled. Contact administrator.');
    }
  }

  // Verify password against agent's password hash
  const passwordValid = await comparePassword(password, agent.passwordHash);
  if (!passwordValid) {
    await auditLog(agent.id, AUDIT_ACTIONS.LOGIN_FAILED, `Invalid password for ${identifier}`, ip);
    throw createError(401, 'Invalid extension/email or password');
  }

  // Prevent concurrent active sessions for the same agent
  const isTest = (process.env.NODE_ENV || 'development') === 'test';
  if (!isTest) {
    try {
      const websocketService = require('./websocket.service');
      if (
        websocketService &&
        typeof websocketService.isAgentOnline === 'function' &&
        websocketService.isAgentOnline(agent.id)
      ) {
        await auditLog(
          agent.id,
          AUDIT_ACTIONS.LOGIN_FAILED,
          `Concurrent login blocked for ${identifier} (another session is active)`,
          ip
        );
        throw createError(
          409,
          `An active session is already running for this account (${identifier}). Please logout from the other window/device first.`
        );
      }
    } catch (err) {
      if (err.statusCode === 409) throw err;
    }
  }

  // Generate JWT
  const extNumber = extension ? extension.number : null;
  const tokenPayload = {
    agentId: agent.id,
    extension: extNumber,
    role: agent.role,
  };
  const token = jwt.sign(tokenPayload, config.jwt.secret, { expiresIn: config.jwt.expiry });

  // Update agent status and last login
  await prisma.agent.update({
    where: { id: agent.id },
    data: {
      status: AGENT_STATUS.CONNECTING,
      lastLoginAt: new Date(),
    },
  });

  await auditLog(agent.id, AUDIT_ACTIONS.LOGIN, `Login via ${identifier}`, ip);

  log.info(`Agent ${agent.name} [${agent.role}] logged in via ${identifier}`);

  return {
    token,
    agent: {
      id: agent.id,
      name: agent.name,
      email: agent.email,
      role: agent.role,
      status: AGENT_STATUS.CONNECTING,
    },
    extension: extension
      ? {
          number: extension.number,
          realm: extension.realm,
        }
      : null,
  };
}

/**
 * Get SIP credentials for WebRTC registration.
 * Returns HA1 hash + connection details. Never returns plaintext SIP password.
 */
async function getSipCredentials(agentId) {
  const extension = await prisma.extension.findUnique({
    where: { agentId },
  });

  if (!extension) {
    throw createError(404, 'No extension assigned to this agent');
  }

  if (!extension.enabled) {
    throw createError(403, 'Extension is disabled');
  }

  return {
    wsUrl: config.sip.wssUrl,
    sipUri: `sip:${extension.sipUsername}@${extension.realm}`,
    sipUsername: extension.sipUsername,
    ha1: extension.sipHa1,
    realm: extension.realm,
    stunServer: config.sip.stunServer,
    displayName: extension.number,
  };
}

/**
 * Validate a JWT token and return decoded payload.
 */
function validateToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch {
    return null;
  }
}

/**
 * Logout: set agent offline.
 */
async function logout(agentId, ip) {
  await prisma.agent.update({
    where: { id: agentId },
    data: { status: AGENT_STATUS.OFFLINE },
  });
  await auditLog(agentId, AUDIT_ACTIONS.LOGOUT, 'Agent logged out', ip);
  log.info(`Agent ${agentId} logged out`);
}

/**
 * Write an audit log entry.
 */
async function auditLog(agentId, action, details, ip) {
  try {
    await prisma.auditLog.create({
      data: { agentId, action, details, ip },
    });
  } catch (err) {
    log.error('Failed to write audit log', err.message);
  }
}

function createError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

module.exports = {
  login,
  getSipCredentials,
  validateToken,
  logout,
  auditLog,
};
