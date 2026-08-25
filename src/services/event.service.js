const { PrismaClient } = require('@prisma/client');
const { createLogger } = require('../utils/logger');
const { AGENT_STATUS, CALL_DIRECTION, CALL_STATUS, WS_EVENTS } = require('../constants');
const extensionService = require('./extension.service');

const prisma = new PrismaClient();
const log = createLogger('event-service');

let websocketService = null;

/**
 * Set the websocket service reference for broadcasting events.
 */
function setWebsocketService(wsSvc) {
  websocketService = wsSvc;
}

/**
 * Process a FreeSWITCH ESL event.
 * Maps FS events to application events and updates DB.
 */
function handleFreeSwitchEvent(event) {
  const eventName = event.getHeader?.('Event-Name') || '';
  const eventSubclass = event.getHeader?.('Event-Subclass') || '';

  switch (eventName) {
    case 'CUSTOM':
      handleCustomEvent(eventSubclass, event);
      break;
    case 'CHANNEL_CREATE':
      handleChannelCreate(event);
      break;
    case 'CHANNEL_ANSWER':
      handleChannelAnswer(event);
      break;
    case 'CHANNEL_HANGUP_COMPLETE':
      handleChannelHangup(event);
      break;
    case 'CHANNEL_HOLD':
      handleChannelHold(event, true);
      break;
    case 'CHANNEL_UNHOLD':
      handleChannelHold(event, false);
      break;
    default:
      break;
  }
}

/**
 * Handle sofia registration events.
 */
function handleCustomEvent(subclass, event) {
  const username = event.getHeader?.('from-user') || event.getHeader?.('user') || '';
  const ip = event.getHeader?.('network-ip') || event.getHeader?.('contact-host') || '';

  switch (subclass) {
    case 'sofia::register':
      log.info(`Registration: ${username} from ${ip}`);
      extensionService.updateRegistrationStatus(username, true, ip);
      broadcastToExtension(username, WS_EVENTS.REGISTRATION_STATUS, {
        registered: true,
        extension: username,
      });
      updateAgentStatusForExtension(username, AGENT_STATUS.ONLINE);
      break;

    case 'sofia::unregister':
      log.info(`Unregistration: ${username}`);
      extensionService.updateRegistrationStatus(username, false, null);
      broadcastToExtension(username, WS_EVENTS.REGISTRATION_STATUS, {
        registered: false,
        extension: username,
      });
      updateAgentStatusForExtension(username, AGENT_STATUS.OFFLINE);
      break;

    case 'sofia::register_failure':
      log.warn(`Registration failure: ${username}`);
      broadcastToExtension(username, WS_EVENTS.REGISTRATION_STATUS, {
        registered: false,
        extension: username,
        error: 'Registration failed',
      });
      break;

    default:
      break;
  }
}

/**
 * Handle new channel creation (call starting).
 * For inbound calls from Twilio SIP trunk, notifies the target agent extension.
 */
async function handleChannelCreate(event) {
  const uuid = event.getHeader?.('Unique-ID') || '';
  const direction = event.getHeader?.('Call-Direction') || '';
  const callerNumber = event.getHeader?.('Caller-Caller-ID-Number') || event.getHeader?.('variable_sip_from_user') || '';
  const callerName = event.getHeader?.('Caller-Caller-ID-Name') || callerNumber;
  const calleeNumber = event.getHeader?.('Caller-Destination-Number') || 
                       event.getHeader?.('variable_sip_to_user') || 
                       event.getHeader?.('variable_destination_number') || 
                       event.getHeader?.('Hunt-Destination-Number') || '';
  const callerUsername = event.getHeader?.('variable_user_name') || '';

  log.info(`Channel created: ${uuid} ${direction} ${callerNumber} (${callerName}) → ${calleeNumber}`);

  if (direction === 'inbound' && calleeNumber) {
    // Check if calleeNumber is a direct extension OR a TFN / DID number
    let targetExtensionNumber = calleeNumber;
    let tfnRecord = null;

    // 1. Check direct Extension
    let ext = await prisma.extension.findUnique({
      where: { number: calleeNumber },
      include: { tfn: { include: { trunk: { select: { name: true } } } } },
    });

    // 2. If not found, check if it's a TFN Number (e.g. +18885752806)
    if (!ext) {
      const cleanDid = calleeNumber.replace(/^\+/, '');
      tfnRecord = await prisma.tfnNumber.findFirst({
        where: {
          OR: [
            { number: calleeNumber },
            { number: `+${cleanDid}` },
            { number: cleanDid },
          ],
        },
        include: { extension: true, trunk: true },
      });

      if (tfnRecord && tfnRecord.extension) {
        targetExtensionNumber = tfnRecord.extension.number;
        ext = tfnRecord.extension;
      }
    }

    if (ext || tfnRecord) {
      const tfnLabel = tfnRecord?.label || ext?.tfn?.label || 'US Toll-Free Support';
      const tfnNumber = tfnRecord?.number || ext?.tfn?.number || calleeNumber;
      const trunkName = tfnRecord?.trunk?.name || ext?.tfn?.trunk?.name || 'Twilio SIP Trunk';

      const payload = {
        from: callerNumber || 'Unknown Caller',
        callerName: callerName || callerNumber || 'Incoming Call',
        callUuid: uuid,
        uuid,
        calleeNumber: targetExtensionNumber,
        tfnNumber,
        tfnLabel,
        trunkName,
        isTfn: !!tfnNumber,
      };

      if (targetExtensionNumber && targetExtensionNumber !== calleeNumber) {
        // Broadcast to specifically mapped extension (e.g., 1002)
        broadcastToExtension(targetExtensionNumber, WS_EVENTS.INCOMING_CALL, payload);
        updateAgentStatusForExtension(targetExtensionNumber, AGENT_STATUS.RINGING);
      } else {
        // Broadcast to all online agents
        if (websocketService) {
          websocketService.broadcast({
            type: WS_EVENTS.INCOMING_CALL,
            data: payload,
          });
        }
      }

      log.info(`📞 Inbound call from ${callerNumber} → TFN ${tfnNumber} → Ext ${targetExtensionNumber || 'ALL'} (UUID: ${uuid})`);
    }
  }

  if (direction === 'outbound' && callerUsername) {
    updateAgentStatusForExtension(callerUsername, AGENT_STATUS.RINGING);
  }
}

/**
 * Handle channel answered.
 */
async function handleChannelAnswer(event) {
  const uuid = event.getHeader?.('Unique-ID') || '';
  const callerNumber = event.getHeader?.('Caller-Caller-ID-Number') || '';
  const calleeNumber = event.getHeader?.('Caller-Destination-Number') || '';
  const callerUsername = event.getHeader?.('variable_user_name') || '';

  log.info(`Channel answered: ${uuid}`);

  // Notify relevant extension
  const extensionNumber = callerUsername || calleeNumber;
  broadcastToExtension(extensionNumber, WS_EVENTS.CALL_ANSWERED, {
    uuid,
    callerNumber,
    calleeNumber,
  });
  updateAgentStatusForExtension(extensionNumber, AGENT_STATUS.IN_CALL);
}

/**
 * Handle channel hangup complete — create call log.
 */
async function handleChannelHangup(event) {
  const uuid = event.getHeader?.('Unique-ID') || '';
  const direction = event.getHeader?.('Call-Direction') || '';
  const callerNumber = event.getHeader?.('Caller-Caller-ID-Number') || '';
  const calleeNumber = event.getHeader?.('Caller-Destination-Number') || '';
  const hangupCause = event.getHeader?.('Hangup-Cause') || '';
  const duration = parseInt(event.getHeader?.('variable_billsec') || '0', 10);
  const callerUsername = event.getHeader?.('variable_user_name') || '';
  const startEpoch = event.getHeader?.('variable_start_epoch');
  const answerEpoch = event.getHeader?.('variable_answer_epoch');
  const endEpoch = event.getHeader?.('variable_end_epoch');

  log.info(`Channel hangup: ${uuid} cause=${hangupCause} duration=${duration}s`);

  // Determine which extension this call belongs to
  const extensionNumber = callerUsername || callerNumber;
  const ext = await prisma.extension.findUnique({ where: { number: extensionNumber } }).catch(() => null);

  if (ext) {
    // Create call log
    const callStatus = duration > 0 ? CALL_STATUS.ANSWERED :
      hangupCause === 'ORIGINATOR_CANCEL' ? CALL_STATUS.REJECTED : CALL_STATUS.MISSED;

    try {
      await prisma.callLog.create({
        data: {
          extensionId: ext.id,
          direction: direction === 'outbound' ? CALL_DIRECTION.OUTBOUND : CALL_DIRECTION.INBOUND,
          callerNumber,
          calleeNumber,
          status: callStatus,
          duration,
          startedAt: startEpoch ? new Date(parseInt(startEpoch, 10) * 1000) : new Date(),
          answeredAt: answerEpoch && answerEpoch !== '0' ? new Date(parseInt(answerEpoch, 10) * 1000) : null,
          endedAt: endEpoch ? new Date(parseInt(endEpoch, 10) * 1000) : new Date(),
          callUuid: uuid,
        },
      });
    } catch (err) {
      log.error('Failed to create call log', err.message);
    }

    broadcastToExtension(extensionNumber, WS_EVENTS.CALL_ENDED, {
      uuid,
      duration,
      hangupCause,
    });
    updateAgentStatusForExtension(extensionNumber, AGENT_STATUS.ONLINE);
  }
}

/**
 * Handle hold/unhold events.
 */
function handleChannelHold(event, isHold) {
  const uuid = event.getHeader?.('Unique-ID') || '';
  const callerUsername = event.getHeader?.('variable_user_name') || '';

  if (callerUsername) {
    broadcastToExtension(callerUsername, isHold ? WS_EVENTS.CALL_HELD : WS_EVENTS.CALL_RESUMED, { uuid });
    updateAgentStatusForExtension(callerUsername, isHold ? AGENT_STATUS.ON_HOLD : AGENT_STATUS.IN_CALL);
  }
}

/**
 * Broadcast an event to the agent who owns the given extension.
 */
function broadcastToExtension(extensionNumber, eventType, data) {
  if (!websocketService) return;
  websocketService.sendToExtension(extensionNumber, { type: eventType, data });
}

/**
 * Update agent status based on extension number.
 */
async function updateAgentStatusForExtension(extensionNumber, status) {
  try {
    const ext = await prisma.extension.findUnique({
      where: { number: extensionNumber },
    });
    if (ext?.agentId) {
      await prisma.agent.update({
        where: { id: ext.agentId },
        data: { status },
      });

      if (websocketService) {
        websocketService.sendToExtension(extensionNumber, {
          type: WS_EVENTS.AGENT_STATUS_CHANGED,
          data: { status },
        });
      }
    }
  } catch (err) {
    log.error(`Failed to update agent status for ext ${extensionNumber}`, err.message);
  }
}

module.exports = {
  setWebsocketService,
  handleFreeSwitchEvent,
};
