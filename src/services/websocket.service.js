const WebSocket = require('ws');
const { PrismaClient } = require('@prisma/client');
const { createLogger } = require('../utils/logger');
const authService = require('./auth.service');
const { AGENT_STATUS } = require('../constants');

const prisma = new PrismaClient();
const log = createLogger('websocket-service');

// Map: agentId → { ws, extensionNumber }
const clients = new Map();
// Map: extensionNumber → agentId (reverse lookup)
const extensionToAgent = new Map();

let wss = null;

/**
 * Initialize WebSocket server on the given HTTP server.
 */
function initialize(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    handleConnection(ws, req);
  });

  // Heartbeat to detect dead connections
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        log.debug('Terminating dead WS connection');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  log.info('WebSocket server initialized on /ws');
}

/**
 * Handle new WebSocket connection.
 */
async function handleConnection(ws, req) {
  // Extract token from query string
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');

  if (!token) {
    ws.close(4001, 'Authentication required');
    return;
  }

  const decoded = authService.validateToken(token);
  if (!decoded) {
    ws.close(4001, 'Invalid or expired token');
    return;
  }

  const { agentId, extension } = decoded;

  // Close existing connection for this agent (single session)
  if (clients.has(agentId)) {
    const existing = clients.get(agentId);
    if (existing.ws.readyState === WebSocket.OPEN) {
      existing.ws.close(4002, 'Session replaced');
    }
  }

  // Register connection
  ws.isAlive = true;
  ws.agentId = agentId;
  ws.extensionNumber = extension;
  clients.set(agentId, { ws, extensionNumber: extension });
  extensionToAgent.set(extension, agentId);

  log.info(`Agent ${agentId} connected via WebSocket (ext: ${extension})`);

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (data) => {
    handleMessage(ws, data);
  });

  ws.on('close', () => {
    handleDisconnect(agentId, extension);
  });

  ws.on('error', (err) => {
    log.error(`WS error for agent ${agentId}`, err.message);
  });

  // Send initial state and set agent ONLINE
  try {
    await prisma.agent.update({
      where: { id: agentId },
      data: { status: AGENT_STATUS.ONLINE },
    });
  } catch {}

  sendToAgent(agentId, {
    type: 'connected',
    data: { agentId, extension },
  });
  sendToAgent(agentId, {
    type: 'agent_status_changed',
    data: { status: AGENT_STATUS.ONLINE },
  });
}

/**
 * Handle incoming WebSocket messages from the browser.
 */
async function handleMessage(ws, rawData) {
  try {
    const message = JSON.parse(rawData.toString());
    const { type, data } = message;
    log.debug(`WS message from agent ${ws.agentId} (ext: ${ws.extensionNumber}):`, type);

    switch (type) {
      case 'ping': {
        ws.isAlive = true;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
        break;
      }

      case 'pong': {
        ws.isAlive = true;
        break;
      }

      case 'call_initiate': {
        const { to, callerNumber, callerName, sdpOffer, callUuid } = data;
        const targetAgentId = extensionToAgent.get(to);

        if (!targetAgentId || !clients.has(targetAgentId)) {
          sendToAgent(ws.agentId, {
            type: 'call_failed',
            data: { cause: `Extension ${to} is currently offline` },
          });
          return;
        }

        // Forward incoming call to target agent
        sendToAgent(targetAgentId, {
          type: 'incoming_call',
          data: {
            from: callerNumber || ws.extensionNumber,
            callerName: callerName || `Agent Ext ${ws.extensionNumber}`,
            sdpOffer,
            callUuid: callUuid || `call-${Date.now()}`,
          },
        });

        // Notify caller that remote is ringing
        sendToAgent(ws.agentId, {
          type: 'call_progress',
          data: { to, status: 'Ringing' },
        });

        // Update statuses to RINGING
        try {
          await prisma.agent.updateMany({
            where: { id: { in: [ws.agentId, targetAgentId] } },
            data: { status: AGENT_STATUS.RINGING },
          });
        } catch {}
        break;
      }

      case 'call_answer': {
        const { to, sdpAnswer, callUuid } = data;
        const targetAgentId = extensionToAgent.get(to);

        if (targetAgentId) {
          sendToAgent(targetAgentId, {
            type: 'call_accepted',
            data: {
              from: ws.extensionNumber,
              sdpAnswer,
              callUuid,
            },
          });

          // Update both agents to IN_CALL
          try {
            await prisma.agent.updateMany({
              where: { id: { in: [ws.agentId, targetAgentId] } },
              data: { status: AGENT_STATUS.IN_CALL },
            });
          } catch {}
        }
        break;
      }

      case 'call_reject': {
        const { to, callUuid } = data;
        const targetAgentId = extensionToAgent.get(to);

        if (targetAgentId) {
          sendToAgent(targetAgentId, {
            type: 'call_failed',
            data: { cause: 'Call Rejected by user', callUuid },
          });

          try {
            await prisma.agent.updateMany({
              where: { id: { in: [ws.agentId, targetAgentId] } },
              data: { status: AGENT_STATUS.ONLINE },
            });
          } catch {}
        }
        break;
      }

      case 'call_hangup': {
        const { to, callUuid, duration, callerNumber, calleeNumber, status } = data;
        const targetAgentId = extensionToAgent.get(to);

        if (targetAgentId) {
          sendToAgent(targetAgentId, {
            type: 'call_ended',
            data: { by: ws.extensionNumber, callUuid, duration },
          });
        }

        // Reset statuses to ONLINE
        try {
          const agentIds = [ws.agentId];
          if (targetAgentId) agentIds.push(targetAgentId);
          await prisma.agent.updateMany({
            where: { id: { in: agentIds } },
            data: { status: AGENT_STATUS.ONLINE },
          });

          // Save / Log Call in SQLite database
          const extRecord = await prisma.extension.findUnique({
            where: { number: ws.extensionNumber },
            include: { tfn: true },
          });

          if (extRecord) {
            await prisma.callLog.create({
              data: {
                extensionId: extRecord.id,
                tfnNumber: extRecord.tfn?.number || null,
                direction: 'outbound',
                callerNumber: callerNumber || ws.extensionNumber,
                calleeNumber: calleeNumber || to || 'Unknown',
                status: status || (duration > 0 ? 'answered' : 'missed'),
                duration: duration || 0,
                region: 'Internal (WebRTC)',
                startedAt: new Date(Date.now() - (duration || 0) * 1000),
                answeredAt: duration > 0 ? new Date(Date.now() - duration * 1000) : null,
                endedAt: new Date(),
                callUuid: callUuid || `call-${Date.now()}`,
              },
            });
          }
        } catch (e) {
          log.error('Failed to log WebRTC call:', e.message);
        }
        break;
      }

      case 'ice_candidate': {
        const { to, candidate } = data;
        const targetAgentId = extensionToAgent.get(to);
        if (targetAgentId) {
          sendToAgent(targetAgentId, {
            type: 'ice_candidate',
            data: { from: ws.extensionNumber, candidate },
          });
        }
        break;
      }

      default:
        log.debug('Unhandled message type:', type);
    }
  } catch (err) {
    log.error('Invalid WS message', err.message);
  }
}

/**
 * Handle agent disconnect — mark offline after grace period.
 */
async function handleDisconnect(agentId, extension) {
  clients.delete(agentId);
  extensionToAgent.delete(extension);
  log.info(`Agent ${agentId} disconnected (ext: ${extension})`);

  // Grace period: wait 10 seconds before marking offline
  setTimeout(async () => {
    if (!clients.has(agentId)) {
      try {
        await prisma.agent.update({
          where: { id: agentId },
          data: { status: AGENT_STATUS.OFFLINE },
        });
        log.info(`Agent ${agentId} marked OFFLINE after disconnect grace period`);
      } catch (err) {
        log.error(`Failed to set agent ${agentId} offline`, err.message);
      }
    }
  }, 10000);
}

/**
 * Send a message to a specific agent by ID.
 */
function sendToAgent(agentId, message) {
  const client = clients.get(agentId);
  if (client && client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
  }
}

/**
 * Send a message to the agent who owns a specific extension.
 */
function sendToExtension(extensionNumber, message) {
  const agentId = extensionToAgent.get(extensionNumber);
  if (agentId) {
    sendToAgent(agentId, message);
  }
}

/**
 * Broadcast a message to all connected agents.
 */
function broadcast(message) {
  const payload = JSON.stringify(message);
  clients.forEach(({ ws }) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}

/**
 * Get count of connected agents.
 */
function getConnectedCount() {
  return clients.size;
}

/**
 * Check if an agent currently has an active, connected WebSocket session.
 */
function isAgentOnline(agentId) {
  const client = clients.get(agentId);
  return !!(client && client.ws && client.ws.readyState === WebSocket.OPEN);
}

module.exports = {
  initialize,
  sendToAgent,
  sendToExtension,
  broadcast,
  getConnectedCount,
  isAgentOnline,
};
