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
  const accountSid = config.twilio.accountSid;
  const apiKey = config.twilio.apiKey;
  const apiSecret = config.twilio.apiSecret;
  const callerId = from || config.twilio.defaultFrom || '+17627446471';

  // Clean and format destination
  let cleanTo = (to || '').replace(/[\s\-()]/g, '');
  if (!cleanTo.startsWith('+')) {
    if (cleanTo.length === 10) cleanTo = `+1${cleanTo}`;
    else cleanTo = `+${cleanTo}`;
  }

  log.info(`Initiating Twilio Voice Call: ${callerId} → ${cleanTo} (Bridging to Ext: ${extension})`);

  // TwiML to bridge Twilio call to FreeSWITCH extension via SIP on port 5080
  const twiml = `<Response><Dial callerId="${callerId}"><Sip>sip:${extension}@${vpsIp}:5080</Sip></Dial></Response>`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;
  const params = new URLSearchParams();
  params.append('To', cleanTo);
  params.append('From', callerId);
  params.append('Twiml', twiml);

  const authHeader = 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

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

module.exports = {
  makeCall,
};
