const express = require('express');
const twilio = require('twilio');
const config = require('../config');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;

/**
 * Generate a Twilio Voice Access Token for WebRTC browser calls
 */
router.get('/token', authenticate, (req, res) => {
  try {
    const accountSid = config.twilio.accountSid || process.env.TWILIO_ACCOUNT_SID;
    const apiKey = config.twilio.apiKey || process.env.TWILIO_API_KEY;
    const apiSecret = config.twilio.apiSecret || process.env.TWILIO_API_SECRET;
    const appSid = process.env.TWILIO_TWIML_APP_SID || 'APf38e8b152a52cf808fe806db2e0131ba';

    const extNumber = typeof req.agent?.extension === 'object' 
      ? req.agent?.extension?.number 
      : (req.agent?.extension || req.agent?.id || '1003');

    const session = req.query.session || req.body.session || Date.now();
    const identity = `agent_${extNumber}_${session}`;

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: appSid,
      incomingAllow: true,
    });

    const token = new AccessToken(accountSid, apiKey, apiSecret, {
      identity,
      ttl: 86400,
    });
    token.addGrant(voiceGrant);

    res.json({
      token: token.toJwt(),
      identity,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Twilio TwiML webhook executed when browser initiates an outbound call or inbound call arrives
 * Bridges directly with zero delay and passes audio to recipient/agent
 */
router.all('/twiml', express.urlencoded({ extended: true }), (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  const to = req.body.To || req.query.To;
  let rawCallerId = req.body.CallerId || req.query.CallerId || config.twilio.defaultFrom || '+17627446471';
  let callerId = String(rawCallerId).replace(/[\s\-()]/g, '');
  if (!callerId.startsWith('+')) {
    callerId = `+${callerId}`;
  }

  if (to) {
    let cleanTo = String(to).replace(/[\s\-()]/g, '');

    // Check if destination is an internal WebRTC agent client or 4-digit extension
    if (cleanTo.startsWith('client:') || cleanTo.startsWith('agent_') || /^\d{4}$/.test(cleanTo)) {
      let clientName = cleanTo.replace(/^client:/, '');
      if (/^\d{4}$/.test(clientName)) {
        clientName = `agent_${clientName}`;
      }
      const dial = response.dial({ answerOnBridge: true });
      dial.client(clientName);
    } else {
      // Outbound PSTN Dialing
      if (!cleanTo.startsWith('+')) {
        if (cleanTo.length === 10) cleanTo = `+1${cleanTo}`;
        else cleanTo = `+${cleanTo}`;
      }

      // For international calls (e.g. India +91), ensure non-toll-free DID callerId
      if (cleanTo.startsWith('+91') && (callerId.startsWith('+1888') || callerId.startsWith('+1800'))) {
        callerId = config.twilio.defaultFrom || '+17627446471';
      }

      // Direct PSTN bridge with answerOnBridge=true
      // This ensures ringing tone until remote party picks up, then instant 2-way audio
      const dial = response.dial({
        callerId,
        answerOnBridge: true,
        timeout: 45,
        timeLimit: 14400,
      });
      dial.number(cleanTo);
    }
  } else {
    // Inbound call without direct parameter -> Ring active agent clients
    const dial = response.dial({ answerOnBridge: true, timeout: 45 });
    dial.client('agent_1001');
    dial.client('agent_1002');
    dial.client('agent_1003');
    dial.client('agent_1004');
  }

  res.type('text/xml');
  res.send(response.toString());
});

/**
 * Twilio Call Status Callback webhook
 */
router.all('/status', express.urlencoded({ extended: true }), (req, res) => {
  res.type('text/xml');
  res.send('<Response/>');
});

module.exports = router;

