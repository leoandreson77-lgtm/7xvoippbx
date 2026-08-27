const config = require('../config');

const log = {
  info: (msg, ...args) => console.log(`[${new Date().toISOString()}] [INFO] [twilio-service] ${msg}`, ...args),
  warn: (msg, ...args) => console.log(`[${new Date().toISOString()}] [WARN] [twilio-service] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[${new Date().toISOString()}] [ERROR] [twilio-service] ${msg}`, ...args),
};

/**
 * Place an outbound PSTN call via Twilio Programmable Voice REST API.
 * Bridges the customer directly to the agent extension on the VPS FreeSWITCH PBX.
 * @param {Object} options
 * @param {string} options.to - Destination phone number
 * @param {string} [options.from] - Outbound caller ID (defaults to assigned DID)
 * @param {string} options.extension - Agent extension number
 * @param {string} [options.vpsIp] - FreeSWITCH PBX Public IP
 */
async function makeCall({ to, from, extension, vpsIp = '31.97.41.165' }) {
  const accountSid = config.twilio.accountSid || process.env.TWILIO_ACCOUNT_SID;
  const authToken = config.twilio.authToken || process.env.TWILIO_AUTH_TOKEN;
  const callerId = from || config.twilio.defaultFrom || '+17627446471';

  // Clean and format destination
  let cleanTo = (to || '').replace(/[\s\-()]/g, '');
  if (!cleanTo.startsWith('+')) {
    if (cleanTo.length === 10) cleanTo = `+1${cleanTo}`;
    else cleanTo = `+${cleanTo}`;
  }

  log.info(`Initiating Twilio Voice Call: ${callerId} → ${cleanTo} (Bridging to Agent Ext: ${extension})`);

  // Bridge customer directly to logged-in WebRTC client or FreeSWITCH SIP extension
  const agentClient = `agent_${extension || '1003'}`;
  const twiml = `<Response><Dial answerOnBridge="true" callerId="${callerId}"><Client>${agentClient}</Client><Sip>sip:${extension || '1003'}@${vpsIp}:5060</Sip></Dial></Response>`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;
  const params = new URLSearchParams();
  params.append('To', cleanTo);
  params.append('From', callerId);
  params.append('Twiml', twiml);

  const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = await response.json();
  if (!response.ok) {
    log.error(`Twilio call creation failed: ${data.message || JSON.stringify(data)}`);
    throw new Error(data.message || 'Failed to initiate Twilio call');
  }

  log.info(`✓ Twilio call created successfully! Call SID: ${data.sid}, Status: ${data.status}`);
  return data;
}

/**
 * Get live call status from Twilio by Call SID
 */
async function getCallStatus(callSid) {
  const accountSid = config.twilio.accountSid || process.env.TWILIO_ACCOUNT_SID;
  const authToken = config.twilio.authToken || process.env.TWILIO_AUTH_TOKEN;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`;
  const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Authorization': authHeader },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch call status: ${response.statusText}`);
  }
  return response.json();
}

module.exports = {
  makeCall,
  getCallStatus,
};

