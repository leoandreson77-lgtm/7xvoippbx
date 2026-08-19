const express = require('express');
const { authenticate } = require('../middleware/auth');
const agentService = require('../services/agent.service');
const freeswitchService = require('../services/freeswitch.service');
const { isValidDialString, sanitize } = require('../utils/validators');
const config = require('../config');

const router = express.Router();

// All agent routes require authentication
router.use(authenticate);

/**
 * GET /api/agent/profile
 * Get current agent's profile and extension info.
 */
router.get('/profile', async (req, res, next) => {
  try {
    const profile = await agentService.getAgentProfile(req.agent.id);
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/agent/status
 * Update agent status.
 */
router.put('/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    const agent = await agentService.updateStatus(req.agent.id, status);
    res.json({ status: agent.status });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/agent/calls
 * Get recent call history.
 */
router.get('/calls', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const calls = await agentService.getRecentCalls(req.agent.id, limit);
    res.json(calls);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/agent/call
 * Initiate an outbound call via FreeSWITCH.
 */
router.post('/call', async (req, res, next) => {
  try {
    const destination = sanitize(req.body.destination);
    if (!destination || !isValidDialString(destination)) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }

    const extensionNumber = req.agent.extension;
    const realm = config.sip.domain;

    // Look up extension's assigned TFN / DID number
    let callerId = undefined;
    if (extensionNumber) {
      const extRecord = await extensionService.getByNumber(extensionNumber);
      if (extRecord && extRecord.tfn) {
        callerId = extRecord.tfn.number;
      }
    }

    const result = await freeswitchService.originateCall(extensionNumber, destination, realm, callerId);
    res.json({ success: true, message: 'Call initiated', callerId: callerId || 'Default', result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/agent/hangup
 * Hang up a call by UUID.
 */
router.post('/hangup', async (req, res, next) => {
  try {
    const { uuid } = req.body;
    if (!uuid) {
      return res.status(400).json({ error: 'Call UUID required' });
    }
    await freeswitchService.hangupCall(uuid);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/agent/hold
 * Put call on hold / resume.
 */
router.post('/hold', async (req, res, next) => {
  try {
    const { uuid, hold } = req.body;
    if (!uuid) {
      return res.status(400).json({ error: 'Call UUID required' });
    }
    if (hold) {
      await freeswitchService.holdCall(uuid);
    } else {
      await freeswitchService.resumeCall(uuid);
    }
    res.json({ success: true, held: !!hold });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/agent/dtmf
 * Send DTMF tones.
 */
router.post('/dtmf', async (req, res, next) => {
  try {
    const { uuid, digits } = req.body;
    if (!uuid || !digits) {
      return res.status(400).json({ error: 'Call UUID and digits required' });
    }
    if (!/^[0-9*#]+$/.test(digits)) {
      return res.status(400).json({ error: 'Invalid DTMF digits' });
    }
    await freeswitchService.sendDtmf(uuid, digits);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
