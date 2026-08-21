const { createLogger } = require('../utils/logger');
const config = require('../config');

const log = createLogger('freeswitch-service');

let eslConnection = null;
let reconnectTimer = null;
let isConnecting = false;
let reconnectInterval = 5000;
const MAX_RECONNECT_INTERVAL = 30000;

/**
 * Connect to FreeSWITCH via Event Socket Layer (ESL).
 * Auto-reconnects on disconnect.
 */
function connect(onEvent) {
  if (!config.freeswitch.host) {
    log.error('Cannot connect to FreeSWITCH ESL: FREESWITCH_HOST environment variable is missing.');
    return;
  }

  if (isConnecting) return;
  isConnecting = true;

  try {
    // Dynamic require to handle missing modesl gracefully
    const esl = require('modesl');

    const conn = new esl.Connection(
      config.freeswitch.host,
      config.freeswitch.port,
      config.freeswitch.password,
      () => {
        isConnecting = false;
        eslConnection = conn;
        reconnectInterval = 5000; // Reset backoff on success
        log.info(`✓ Connected to FreeSWITCH ESL at ${config.freeswitch.host}:${config.freeswitch.port}`);

        // Subscribe to events
        conn.subscribe([
          'CHANNEL_CREATE',
          'CHANNEL_ANSWER',
          'CHANNEL_HANGUP',
          'CHANNEL_HANGUP_COMPLETE',
          'CHANNEL_BRIDGE',
          'CHANNEL_HOLD',
          'CHANNEL_UNHOLD',
          'DTMF',
          'CUSTOM sofia::register',
          'CUSTOM sofia::unregister',
          'CUSTOM sofia::register_failure',
        ]);

        conn.on('esl::event::*', (event) => {
          if (onEvent) {
            try {
              onEvent(event);
            } catch (err) {
              log.error('Event handler error', err.message);
            }
          }
        });
      }
    );

    conn.on('error', (err) => {
      isConnecting = false;
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        log.warn(`FreeSWITCH ESL is unreachable at ${config.freeswitch.host}:${config.freeswitch.port} (${err.message}). Retrying in ${Math.round(reconnectInterval / 1000)}s...`);
      } else {
        log.error('ESL connection error', err.message);
      }
      scheduleReconnect(onEvent);
    });

    conn.on('esl::end', () => {
      isConnecting = false;
      eslConnection = null;
      log.warn('ESL connection closed');
      scheduleReconnect(onEvent);
    });
  } catch (err) {
    isConnecting = false;
    log.error('Failed to create ESL connection', err.message);
    scheduleReconnect(onEvent);
  }
}

function scheduleReconnect(onEvent) {
  if (!config.freeswitch.host) return;
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    log.info(`Attempting ESL reconnect to ${config.freeswitch.host}:${config.freeswitch.port}...`);
    connect(onEvent);
  }, reconnectInterval);

  // Exponential backoff up to 30s to prevent log spam
  reconnectInterval = Math.min(Math.round(reconnectInterval * 1.5), MAX_RECONNECT_INTERVAL);
}

/**
 * Execute a FreeSWITCH API command.
 */
function api(command) {
  return new Promise((resolve, reject) => {
    if (!eslConnection) {
      return reject(new Error('ESL not connected'));
    }
    eslConnection.api(command, (result) => {
      const body = result?.body || result?.getBody?.() || '';
      if (typeof body === 'string' && body.startsWith('-ERR')) {
        return reject(new Error(body));
      }
      resolve(body);
    });
  });
}

/**
 * Execute a FreeSWITCH bgapi command (background).
 */
function bgapi(command) {
  return new Promise((resolve, reject) => {
    if (!eslConnection) {
      return reject(new Error('ESL not connected'));
    }
    eslConnection.bgapi(command, (result) => {
      resolve(result?.body || result?.getBody?.() || '');
    });
  });
}

// ── High-level FreeSWITCH operations ──────────────

/**
 * Get registration status for an extension.
 */
async function getRegistrationStatus(extensionNumber) {
  try {
    const result = await api(`sofia status profile internal reg ${extensionNumber}`);
    return {
      registered: !result.includes('No registrations'),
      raw: result,
    };
  } catch {
    return { registered: false, raw: '' };
  }
}

/**
 * Force unregister an extension.
 */
async function unregisterExtension(extensionNumber, realm) {
  try {
    await api(`sofia profile internal flush_inbound_reg ${extensionNumber}@${realm}`);
    log.info(`Force unregistered extension ${extensionNumber}`);
  } catch (err) {
    log.error(`Failed to unregister ${extensionNumber}`, err.message);
  }
}

/**
 * Get registration status for a gateway / SIP trunk.
 */
async function getGatewayStatus(gatewayName = 'sip-trunk') {
  try {
    const result = await api(`sofia status gateway ${gatewayName}`);
    const isReged = result.includes('State: REGED') || result.includes('REGED');
    const stateMatch = result.match(/State\s+:\s+(\w+)/i);
    const state = stateMatch ? stateMatch[1] : (isReged ? 'REGED' : 'OFFLINE');
    return {
      status: state,
      registered: isReged,
      raw: result,
    };
  } catch {
    return { status: 'OFFLINE', registered: false, raw: '' };
  }
}

/**
 * Rescan/reload gateway in FreeSWITCH.
 */
async function rescanGateway(gatewayName = 'sip-trunk') {
  try {
    await api(`sofia profile internal killgw ${gatewayName}`);
    await api('sofia profile internal rescan');
    log.info(`Rescanned gateway ${gatewayName}`);
  } catch (err) {
    log.error(`Failed to rescan gateway ${gatewayName}`, err.message);
  }
}

/**
 * Reload FreeSWITCH XML configuration.
 */
async function reloadXml() {
  try {
    await api('reloadxml');
    log.info('FreeSWITCH XML reloaded');
  } catch (err) {
    log.error('Failed to reload XML', err.message);
  }
}

/**
 * Originate an outbound call from an extension with specific Caller ID / TFN.
 */
async function originateCall(extension, destination, realm, callerIdNumber) {
  const callerId = callerIdNumber || config.trunk.did || extension;
  const trunkHost = config.trunk.host || 'sip.provider.com';
  const cmd = `originate {origination_caller_id_number=${callerId},origination_caller_id_name=KRAD}sofia/internal/${destination}@${trunkHost} &bridge(user/${extension}@${realm})`;
  return api(cmd);
}

/**
 * Hang up a call by UUID.
 */
async function hangupCall(uuid) {
  return api(`uuid_kill ${uuid}`);
}

/**
 * Put a call on hold.
 */
async function holdCall(uuid) {
  return api(`uuid_hold ${uuid}`);
}

/**
 * Resume a held call.
 */
async function resumeCall(uuid) {
  return api(`uuid_hold off ${uuid}`);
}

/**
 * Send DTMF tones on a call.
 */
async function sendDtmf(uuid, digits) {
  return api(`uuid_send_dtmf ${uuid} ${digits}`);
}

/**
 * Get active channels.
 */
async function getActiveChannels() {
  try {
    const result = await api('show channels as json');
    return JSON.parse(result);
  } catch {
    return { rows: [], row_count: 0 };
  }
}

/**
 * Check if ESL is connected.
 */
function isConnected() {
  return eslConnection !== null;
}

/**
 * Disconnect ESL cleanly.
 */
function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (eslConnection) {
    eslConnection.disconnect();
    eslConnection = null;
  }
}

module.exports = {
  connect,
  api,
  bgapi,
  getRegistrationStatus,
  unregisterExtension,
  getGatewayStatus,
  rescanGateway,
  reloadXml,
  originateCall,
  hangupCall,
  holdCall,
  resumeCall,
  sendDtmf,
  getActiveChannels,
  isConnected,
  disconnect,
};
