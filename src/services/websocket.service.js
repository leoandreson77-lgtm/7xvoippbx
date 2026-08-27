const WebSocket = require('ws');
const { PrismaClient } = require('@prisma/client');
const { createLogger } = require('../utils/logger');
const authService = require('./auth.service');
const freeswitchService = require('./freeswitch.service');
const twilioService = require('./twilio.service');
const config = require('../config');
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
        const generatedUuid = callUuid || `call-${Date.now()}`;
        const cleanTo = (to || '').trim();

        const digitsOnly = cleanTo.replace(/\D/g, '');
        const last10 = digitsOnly.slice(-10);

        // Check if destination matches a TFN Number in DB or TFN prefix
        let tfnRecord = null;
        try {
          tfnRecord = await prisma.tfnNumber.findFirst({
            where: {
              OR: [
                { number: cleanTo },
                { number: `+${digitsOnly}` },
                { number: digitsOnly },
                ...(last10.length >= 7 ? [{ number: { contains: last10 } }] : []),
              ],
            },
            include: {
              extensions: { include: { agent: true } },
              trunk: true,
            },
          });
        } catch {}

        // Check if explicitly flagged as an Inbound TFN call (from webhook/trunk) or internal IVR test
        const isTfnCall = data.isTfn === true;

        if (isTfnCall) {
          // ── STRICT TFN ISOLATION & IVR ROUTING ──
          let alignedExtNumbers = null;

          if (tfnRecord && tfnRecord.extensions && tfnRecord.extensions.length > 0) {
            // Extract ONLY the extensions explicitly mapped to THIS specific TFN
            alignedExtNumbers = tfnRecord.extensions.map(e => e.number);
          } else if (!tfnRecord && isGenericTfnPrefix) {
            // Unregistered generic TFN test -> ring all online
            alignedExtNumbers = null;
          } else {
            // TFN exists in database BUT has 0 extensions mapped to it!
            // IVR Announcement: "No extensions assigned to this TFN"
            sendToAgent(ws.agentId, {
              type: 'call_failed',
              data: {
                cause: `🔊 IVR: No extensions are currently mapped to TFN ${cleanTo}. Please assign extensions in Admin Portal.`,
              },
            });
            log.warn(`IVR triggered: Call to TFN ${cleanTo} failed because no extensions are mapped to this TFN.`);
            break;
          }

          log.info(`📞 Inbound TFN Call [${cleanTo}] (${tfnRecord?.label || 'General Helpline'}). Mapped Extensions: ${alignedExtNumbers ? alignedExtNumbers.join(', ') : 'ALL'}`);

          let rangCount = 0;
          clients.forEach(({ ws: agentWs, extensionNumber: agentExt }, agentId) => {
            // STRICT SEPARATION: Ring ONLY if agent is not caller AND agent's extension is aligned to THIS TFN
            const isAligned = !alignedExtNumbers || alignedExtNumbers.includes(agentExt);

            if (agentId !== ws.agentId && isAligned && agentWs.readyState === WebSocket.OPEN) {
              rangCount++;
              agentWs.send(JSON.stringify({
                type: 'incoming_call',
                data: {
                  from: callerNumber || ws.extensionNumber,
                  callerName: `🔊 IVR Helpline: ${tfnRecord?.label || 'Inbound TFN'} (${cleanTo})`,
                  sdpOffer,
                  callUuid: generatedUuid,
                  isTfn: true,
                  tfnNumber: cleanTo,
                  tfnLabel: tfnRecord?.label || 'Inbound Helpline',
                  trunkName: tfnRecord?.trunk?.name || 'Primary Carrier Gateway',
                  ivrPrompt: `Welcome to ${tfnRecord?.label || '7XVOIP Helpline'}. Connecting your call to an aligned agent...`,
                },
              }));
            }
          });

          if (rangCount === 0 && alignedExtNumbers) {
            // Mapped extensions exist for this TFN, but NONE of them are online!
            // IVR Announcement: "All agents for this TFN are currently offline or unavailable."
            sendToAgent(ws.agentId, {
              type: 'call_failed',
              data: {
                cause: `🔊 IVR: All agents for TFN ${cleanTo} (${tfnRecord?.label || 'Helpline'}) are currently offline or busy.`,
              },
            });
            log.warn(`IVR triggered: TFN ${cleanTo} mapped extensions [${alignedExtNumbers.join(', ')}] are all offline.`);
          } else {
            sendToAgent(ws.agentId, {
              type: 'call_progress',
              data: { to: cleanTo, status: `IVR Active — Ringing ${rangCount} Aligned Extension(s)` },
            });
          }
          break;
        }

        // ── DIRECT EXTENSION TO EXTENSION OR OUTBOUND PSTN CALL ──
        const targetExtNumber = (to || '').split('@')[0].replace(/^\+/, '').trim();
        const isInternalExt = /^\d{4}$/.test(targetExtNumber);

        if (isInternalExt) {
          const targetAgentId = extensionToAgent.get(targetExtNumber) || extensionToAgent.get(to);

          if (!targetAgentId || !clients.has(targetAgentId)) {
            sendToAgent(ws.agentId, {
              type: 'call_failed',
              data: { cause: `Extension ${targetExtNumber || to} is currently offline or not logged into dashboard.` },
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
              callUuid: generatedUuid,
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
        } else {
          // ── OUTBOUND CALL VIA DYNAMIC SIP TRUNK ──
          // Look up the extension's TFN → Trunk chain from the database
          let callerId = config.trunk.did || '+18885752806';
          let assignedTrunk = null;
          let trunkDisplayName = 'Default SIP Gateway';

          try {
            const extRecord = await prisma.extension.findUnique({
              where: { number: ws.extensionNumber },
              include: {
                tfn: {
                  include: {
                    trunk: true,
                  },
                },
              },
            });

            if (extRecord && extRecord.tfn) {
              callerId = extRecord.tfn.number;

              // If TFN has a linked SIP trunk from admin panel, use it
              if (extRecord.tfn.trunk && extRecord.tfn.trunk.enabled) {
                assignedTrunk = extRecord.tfn.trunk;
                trunkDisplayName = `${assignedTrunk.name} (${assignedTrunk.provider || 'SIP'})`;
              }
            }
          } catch (e) {}

          log.info(`📞 Routing Outbound PSTN Call [${cleanTo}] via ${trunkDisplayName}`);

          log.info(`📞 Agent ${ws.extensionNumber} initiating call to [${cleanTo}] via ${trunkDisplayName}`);

          // Only invoke server-side REST call if NOT directly initiated via browser WebRTC
          if (!data.isWebRtc) {
            try {
              const callResult = await twilioService.makeCall({
                to: cleanTo,
                from: callerId,
                extension: ws.extensionNumber,
              });

              if (callResult?.sid) {
                const callSid = callResult.sid;
                const pollInterval = setInterval(async () => {
                  try {
                    const statusRes = await twilioService.getCallStatus(callSid);
                    if (statusRes.status === 'in-progress') {
                      clearInterval(pollInterval);
                      sendToAgent(ws.agentId, {
                        type: 'call_accepted',
                        data: { callUuid: callSid, from: ws.extensionNumber },
                      });
                    } else if (['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(statusRes.status)) {
                      clearInterval(pollInterval);
                      sendToAgent(ws.agentId, {
                        type: statusRes.status === 'completed' ? 'call_ended' : 'call_failed',
                        data: { cause: statusRes.status, callUuid: callSid },
                      });
                    }
                  } catch (e) {
                    clearInterval(pollInterval);
                  }
                }, 1500);

                setTimeout(() => clearInterval(pollInterval), 60000);
              }
            } catch (twErr) {
              log.warn(`Twilio call initiate error: ${twErr.message}`);
              sendToAgent(ws.agentId, {
                type: 'call_failed',
                data: { cause: `Call failed: ${twErr.message}` },
              });
              return;
            }
          }

          sendToAgent(ws.agentId, {
            type: 'call_progress',
            data: { to: cleanTo, status: `Dialing via ${trunkDisplayName} (${callerId})` },
          });
        }
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
        } else {
          // If TFN ring-all call, broadcast call_accepted to all online clients
          broadcast({
            type: 'call_accepted',
            data: { from: ws.extensionNumber, sdpAnswer, callUuid },
          });
        }

        // Notify all other agents to stop ringing (call taken)
        clients.forEach(({ ws: agentWs }, agentId) => {
          if (agentId !== ws.agentId && agentWs.readyState === WebSocket.OPEN) {
            agentWs.send(JSON.stringify({
              type: 'call_taken',
              data: { callUuid, answeredBy: ws.extensionNumber },
            }));
          }
        });

        // Update agent to IN_CALL
        try {
          await prisma.agent.update({
            where: { id: ws.agentId },
            data: { status: AGENT_STATUS.IN_CALL },
          });
        } catch {}
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

      case 'call_hangup':
      case 'call_terminate': {
        const { to, callUuid, duration, callerNumber, calleeNumber, status } = data;
        const cleanTargetExt = (to || '').split('@')[0].replace(/^\+/, '').trim();
        const targetAgentId = extensionToAgent.get(cleanTargetExt) || extensionToAgent.get(to);

        if (targetAgentId) {
          sendToAgent(targetAgentId, {
            type: 'call_ended',
            data: { by: ws.extensionNumber, callUuid, duration },
          });
        } else {
          broadcast({
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
