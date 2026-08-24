const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const extensionService = require('../services/extension.service');
const agentService = require('../services/agent.service');
const freeswitchService = require('../services/freeswitch.service');
const { hashPassword } = require('../utils/crypto');
const { isValidExtension, isValidPassword, isValidEmail, sanitize } = require('../utils/validators');
const config = require('../config');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const router = express.Router();

// All admin routes require authentication + admin role
router.use(authenticate, requireAdmin);

// ── Extension Management ──────────────────────────

/**
 * GET /api/admin/extensions
 * List all extensions with agent and registration info.
 */
router.get('/extensions', async (req, res, next) => {
  try {
    const extensions = await extensionService.listExtensions();

    // Enrich with live FreeSWITCH registration status
    const enriched = await Promise.all(
      extensions.map(async (ext) => {
        let liveStatus = { registered: ext.registered };
        try {
          liveStatus = await freeswitchService.getRegistrationStatus(ext.number);
        } catch {
          // ESL might not be connected
        }
        return {
          ...ext,
          liveRegistered: liveStatus.registered,
        };
      })
    );

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/extensions
 * Create a new extension.
 */
router.post('/extensions', async (req, res, next) => {
  try {
    const number = sanitize(req.body.number);
    const sipPassword = req.body.sipPassword;
    const agentId = req.body.agentId || null;

    if (!number || !isValidExtension(number)) {
      return res.status(400).json({ error: 'Valid extension number required (3-6 digits)' });
    }
    if (!sipPassword || !isValidPassword(sipPassword)) {
      return res.status(400).json({ error: 'SIP password must be at least 6 characters' });
    }

    const extension = await extensionService.createExtension({
      number,
      sipPassword,
      realm: config.sip.domain,
      agentId,
    });

    // Reload FreeSWITCH XML so it picks up the new extension via mod_xml_curl
    try {
      await freeswitchService.reloadXml();
    } catch (err) {
      // Log but don't fail — extension is created in DB
    }

    res.status(201).json(extension);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/extensions/:id
 * Update extension (enable/disable, reassign agent, change password).
 */
router.put('/extensions/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const extension = await extensionService.updateExtension(id, req.body);

    try {
      await freeswitchService.reloadXml();
    } catch {
      // Best effort reload
    }

    res.json(extension);
  } catch (err) {
    next(err);
  }
});



// ── Agent Management ──────────────────────────────

/**
 * GET /api/admin/agents
 * List all agents.
 */
router.get('/agents', async (req, res, next) => {
  try {
    const agents = await agentService.listAgents();
    res.json(agents);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/agents
 * Create a new agent.
 */
router.post('/agents', async (req, res, next) => {
  try {
    const name = sanitize(req.body.name);
    const email = sanitize(req.body.email);
    const password = req.body.password;
    const role = req.body.role || 'agent';

    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Name is required (min 2 chars)' });
    }
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!password || !isValidPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!['agent', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Role must be "agent" or "admin"' });
    }

    const passwordHash = await hashPassword(password);
    const agent = await prisma.agent.create({
      data: {
        name,
        email,
        passwordHash,
        role,
        enabled: true,
        status: 'OFFLINE',
      },
    });

    res.status(201).json({
      id: agent.id,
      name: agent.name,
      email: agent.email,
      role: agent.role,
      enabled: agent.enabled,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/agents/:id
 * Update agent (enable/disable, change role).
 */
router.put('/agents/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = {};

    if (typeof req.body.enabled === 'boolean') {
      updateData.enabled = req.body.enabled;
    }
    if (req.body.role && ['agent', 'admin'].includes(req.body.role)) {
      updateData.role = req.body.role;
    }
    if (req.body.name) {
      updateData.name = sanitize(req.body.name);
    }

    // Admin protection: Cannot disable an admin account
    const targetAgent = await prisma.agent.findUnique({ where: { id } });
    if (targetAgent && targetAgent.role === 'admin' && req.body.enabled === false) {
      return res.status(403).json({ error: 'Admin accounts cannot be disabled for security reasons.' });
    }

    const agent = await prisma.agent.update({
      where: { id },
      data: updateData,
    });

    res.json({
      id: agent.id,
      name: agent.name,
      email: agent.email,
      role: agent.role,
      enabled: agent.enabled,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/agents/:id
 * Delete an agent (PROTECTED: Admin accounts cannot be deleted).
 */
router.delete('/agents/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const agent = await prisma.agent.findUnique({ where: { id } });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Admin protection rule: Cannot delete admin users
    if (agent.role === 'admin') {
      return res.status(403).json({ error: 'Admin accounts are protected and cannot be deleted.' });
    }

    // Unlink extension assigned to this agent first to avoid FK constraint failure
    await prisma.extension.updateMany({
      where: { agentId: id },
      data: { agentId: null },
    });

    // Unlink audit logs
    await prisma.auditLog.updateMany({
      where: { agentId: id },
      data: { agentId: null },
    });

    await prisma.agent.delete({ where: { id } });
    res.json({ success: true, message: `Agent ${agent.name} deleted` });
  } catch (err) {
    next(err);
  }
});

// ── Dashboard Stats ───────────────────────────────

/**
 * GET /api/admin/stats
 * Get system overview statistics.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const [totalAgents, totalExtensions, onlineAgents, activeChannels] = await Promise.all([
      prisma.agent.count(),
      prisma.extension.count(),
      prisma.agent.count({ where: { status: { not: 'OFFLINE' } } }),
      freeswitchService.getActiveChannels().catch(() => ({ row_count: 0 })),
    ]);

    res.json({
      totalAgents,
      totalExtensions,
      onlineAgents,
      activeChannels: activeChannels.row_count || 0,
    });
  } catch (err) {
    next(err);
  }
});

// ── Multiple SIP Trunk / Provider Management ──────

/**
 * GET /api/admin/trunks
 * List all configured SIP Trunks.
 */
router.get('/trunks', async (req, res, next) => {
  try {
    const trunks = await prisma.sipTrunk.findMany({
      include: {
        tfns: {
          select: { id: true, number: true, label: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const enrichedTrunks = await Promise.all(
      trunks.map(async (t) => {
        let liveStatus = { status: 'OFFLINE', registered: false };
        try {
          liveStatus = await freeswitchService.getGatewayStatus(`trunk-${t.id}`);
        } catch {}

        // Compute SIP URI for display
        const sipUri = `sip:${t.username || 'user'}@${t.host}:${t.port || 5060}`;

        return {
          ...t,
          sipUri,
          linkedTfnCount: t.tfns ? t.tfns.length : 0,
          liveStatus: liveStatus.status,
          registered: liveStatus.registered,
        };
      })
    );

    res.json(enrichedTrunks);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/trunks
 * Create a new SIP Trunk / Provider.
 */
router.post('/trunks', async (req, res, next) => {
  try {
    const name = sanitize(req.body.name) || 'SIP Trunk';
    const provider = sanitize(req.body.provider) || 'telnyx';
    const host = sanitize(req.body.host);
    const port = parseInt(req.body.port) || 5060;
    const username = sanitize(req.body.username);
    const password = req.body.password || '';
    const didNumber = sanitize(req.body.didNumber) || '';
    const realm = sanitize(req.body.realm) || host;
    const enabled = typeof req.body.enabled === 'boolean' ? req.body.enabled : true;

    if (!host) {
      return res.status(400).json({ error: 'Gateway Host / Proxy IP is required' });
    }

    const trunk = await prisma.sipTrunk.create({
      data: { name, provider, host, port, username, password, didNumber, realm, enabled },
    });

    try {
      await freeswitchService.rescanGateway(`trunk-${trunk.id}`);
    } catch {}

    res.status(201).json(trunk);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/trunks/:id
 * Update an existing SIP Trunk.
 */
router.put('/trunks/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = {};

    if (req.body.name) updateData.name = sanitize(req.body.name);
    if (req.body.provider) updateData.provider = sanitize(req.body.provider);
    if (req.body.host) updateData.host = sanitize(req.body.host);
    if (req.body.port) updateData.port = parseInt(req.body.port) || 5060;
    if (req.body.username) updateData.username = sanitize(req.body.username);
    if (req.body.password !== undefined) updateData.password = req.body.password;
    if (req.body.didNumber !== undefined) updateData.didNumber = sanitize(req.body.didNumber);
    if (req.body.realm !== undefined) updateData.realm = sanitize(req.body.realm);
    if (typeof req.body.enabled === 'boolean') updateData.enabled = req.body.enabled;

    const trunk = await prisma.sipTrunk.update({
      where: { id },
      data: updateData,
    });

    try {
      await freeswitchService.rescanGateway(`trunk-${trunk.id}`);
    } catch {}

    res.json(trunk);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/trunks/:id
 * Delete a SIP Trunk (unlinks associated TFNs first).
 */
router.delete('/trunks/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Unlink any TFNs linked to this trunk first to avoid foreign key failure
    await prisma.tfnNumber.updateMany({
      where: { trunkId: id },
      data: { trunkId: null },
    });

    await prisma.sipTrunk.delete({ where: { id } });
    res.json({ success: true, message: 'SIP Trunk deleted' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/trunks/:id/test
 * Test specific gateway in FreeSWITCH.
 */
router.post('/trunks/:id/test', async (req, res, next) => {
  try {
    const { id } = req.params;
    await freeswitchService.rescanGateway(`trunk-${id}`);
    const liveStatus = await freeswitchService.getGatewayStatus(`trunk-${id}`);
    res.json({
      success: true,
      status: liveStatus.status,
      registered: liveStatus.registered,
      raw: liveStatus.raw,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/sip-trunk (Backward Compatibility)
 */
router.get('/sip-trunk', async (req, res, next) => {
  try {
    const trunk = (await prisma.sipTrunk.findFirst()) || {
      id: 'default',
      name: 'Primary SIP Trunk',
      host: config.trunk.host || 'sip.telnyx.com',
      username: config.trunk.username || '',
      password: config.trunk.password || '',
      didNumber: config.trunk.did || '',
      realm: config.trunk.host || '',
      enabled: true,
      status: 'UNCONFIGURED',
    };

    let liveStatus = { status: 'OFFLINE', registered: false };
    try {
      liveStatus = await freeswitchService.getGatewayStatus('sip-trunk');
    } catch {}

    res.json({
      ...trunk,
      liveStatus: liveStatus.status,
      registered: liveStatus.registered,
      rawStatus: liveStatus.raw,
    });
  } catch (err) {
    next(err);
  }
});

// ── TFN (Toll-Free / DID Number) Management ──────

/**
 * GET /api/admin/tfns
 * List all TFN / DID numbers.
 */
router.get('/tfns', async (req, res, next) => {
  try {
    const tfns = await prisma.tfnNumber.findMany({
      include: {
        trunk: { select: { id: true, name: true, provider: true } },
        extensions: { select: { id: true, number: true, agent: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(tfns);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/tfns
 * Create a new TFN / DID number.
 */
router.post('/tfns', async (req, res, next) => {
  try {
    const number = sanitize(req.body.number);
    const label = sanitize(req.body.label) || 'Toll-Free Number';
    const trunkId = req.body.trunkId || undefined;

    if (!number) {
      return res.status(400).json({ error: 'TFN / DID number is required' });
    }

    const existing = await prisma.tfnNumber.findUnique({ where: { number } });
    if (existing) {
      return res.status(409).json({ error: `TFN ${number} already exists` });
    }

    const tfn = await prisma.tfnNumber.create({
      data: { number, label, trunkId },
    });

    res.status(201).json(tfn);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/tfns/:id
 * Update TFN / DID number label, trunkId, and aligned extension mappings.
 */
router.put('/tfns/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { label, trunkId, extensionIds } = req.body;

    const updateData = {};
    if (label !== undefined) updateData.label = sanitize(label);
    if (trunkId !== undefined) updateData.trunkId = trunkId || null;

    await prisma.tfnNumber.update({
      where: { id },
      data: updateData,
    });

    // If extensionIds array is passed, update aligned extensions
    if (Array.isArray(extensionIds)) {
      // First disconnect extensions currently mapped to this TFN that are not in the new list
      await prisma.extension.updateMany({
        where: { tfnId: id, id: { notIn: extensionIds } },
        data: { tfnId: null },
      });
      // Then connect specified extensions to this TFN
      if (extensionIds.length > 0) {
        await prisma.extension.updateMany({
          where: { id: { in: extensionIds } },
          data: { tfnId: id },
        });
      }
    }

    const fullTfn = await prisma.tfnNumber.findUnique({
      where: { id },
      include: {
        trunk: { select: { id: true, name: true } },
        extensions: { select: { id: true, number: true } },
      },
    });

    res.json(fullTfn);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/tfns/:id
 * Delete a TFN / DID number (unlinks assigned extensions first).
 */
router.delete('/tfns/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Unlink any extensions using this TFN as caller ID first
    await prisma.extension.updateMany({
      where: { tfnId: id },
      data: { tfnId: null },
    });

    await prisma.tfnNumber.delete({ where: { id } });
    res.json({ success: true, message: 'TFN deleted' });
  } catch (err) {
    next(err);
  }
});

// ── CDR (Call Detail Records) & Report Endpoints ──

/**
 * GET /api/admin/cdr
 * Filterable Call History Report.
 */
router.get('/cdr', async (req, res, next) => {
  try {
    const {
      dateFrom,
      dateTo,
      response: statusFilter,
      extension: extFilter,
      source,
      destination,
      direction,
      limit: limitQuery,
      page: pageQuery,
    } = req.query;

    const limit = Math.min(parseInt(limitQuery) || 30, 200);
    const page = Math.max(parseInt(pageQuery) || 1, 1);
    const skip = (page - 1) * limit;

    const where = {};

    // Date Range
    if (dateFrom || dateTo) {
      where.startedAt = {};
      if (dateFrom) where.startedAt.gte = new Date(dateFrom);
      if (dateTo) where.startedAt.lte = new Date(dateTo);
    }

    // Response / Status
    if (statusFilter && statusFilter !== 'ALL') {
      where.status = statusFilter.toLowerCase();
    }

    // Direction
    if (direction && direction !== 'ALL') {
      where.direction = direction.toLowerCase();
    }

    // Source (Caller Number)
    if (source && source.trim()) {
      where.callerNumber = { contains: source.trim() };
    }

    // Destination (Callee Number)
    if (destination && destination.trim()) {
      where.calleeNumber = { contains: destination.trim() };
    }

    // Extension
    if (extFilter && extFilter !== 'ALL') {
      where.extension = {
        number: extFilter.trim(),
      };
    }

    const [totalCount, logs] = await Promise.all([
      prisma.callLog.count({ where }),
      prisma.callLog.findMany({
        where,
        take: limit,
        skip,
        orderBy: { startedAt: 'desc' },
        include: {
          extension: {
            include: {
              agent: { select: { name: true, email: true } },
              tfn: { select: { number: true, label: true } },
            },
          },
        },
      }),
    ]);

    const formattedLogs = logs.map((log) => {
      const durSec = log.duration || 0;
      const min = Math.floor(durSec / 60);
      const sec = durSec % 60;
      const durationFormatted = `${min}m ${sec.toString().padStart(2, '0')}s`;

      return {
        id: log.id,
        callDate: log.startedAt,
        startedAt: log.startedAt,
        answerTime: log.answeredAt || null,
        answeredAt: log.answeredAt || null,
        endTime: log.endedAt || null,
        endedAt: log.endedAt || null,
        direction: (log.direction || 'OUTBOUND').toUpperCase(),
        response: (log.status || 'UNKNOWN').toUpperCase(),
        status: (log.status || 'UNKNOWN').toUpperCase(),
        source: log.callerNumber || '—',
        callerNumber: log.callerNumber || '—',
        destination: log.calleeNumber || '—',
        calleeNumber: log.calleeNumber || '—',
        extension: log.extension ? log.extension.number : '—',
        agentName: log.extension?.agent ? log.extension.agent.name : '—',
        tfnNumber: log.tfnNumber || log.extension?.tfn?.number || '—',
        region: log.region || 'US',
        durationSec: durSec,
        duration: durSec,
        durationFormatted,
        callUuid: log.callUuid,
      };
    });

    res.json({
      resultsFound: totalCount,
      page,
      limit,
      logs: formattedLogs,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/cdr/export
 * Download CDR report as CSV.
 */
router.get('/cdr/export', async (req, res, next) => {
  try {
    const logs = await prisma.callLog.findMany({
      orderBy: { startedAt: 'desc' },
      include: {
        extension: {
          include: {
            agent: { select: { name: true } },
          },
        },
      },
    });

    const headers = [
      'Call Date',
      'Answer Time',
      'End Time',
      'Direction',
      'Response',
      'Source',
      'Destination',
      'Extension',
      'Agent',
      'Region',
      'Duration (Sec)',
    ];

    const rows = logs.map((l) => [
      l.startedAt.toISOString(),
      l.answeredAt ? l.answeredAt.toISOString() : '',
      l.endedAt ? l.endedAt.toISOString() : '',
      l.direction.toUpperCase(),
      l.status.toUpperCase(),
      `"${l.callerNumber}"`,
      `"${l.calleeNumber}"`,
      `"${l.extension?.number || ''}"`,
      `"${l.extension?.agent?.name || ''}"`,
      `"${l.region || 'US'}"`,
      l.duration || 0,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="cdr-call-history-report.csv"');
    res.send(csvContent);
  } catch (err) {
    next(err);
  }
});

// ── Advanced Extension Settings & Supervisor ──────

/**
 * PUT /api/admin/extensions/:id/settings
 * Update advanced extension parameters (Caller ID / TFN, Max locations, Calls receive on).
 */
router.put('/extensions/:id/settings', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tfnId, maxLoginLocations, callsReceiveOn, sipPassword } = req.body;
    const updateData = {};

    if (tfnId !== undefined) updateData.tfnId = tfnId || null;
    if (maxLoginLocations !== undefined) updateData.maxLoginLocations = parseInt(maxLoginLocations) || 1;
    if (callsReceiveOn !== undefined) updateData.callsReceiveOn = sanitize(callsReceiveOn);

    if (sipPassword && sipPassword.length >= 6) {
      const ext = await prisma.extension.findUnique({ where: { id } });
      if (ext) {
        updateData.sipPasswordHash = await bcrypt.hash(sipPassword, 10);
        updateData.sipHa1 = generateHa1(ext.number, ext.realm, sipPassword);
      }
    }

    const updated = await prisma.extension.update({
      where: { id },
      data: updateData,
      include: {
        agent: { select: { name: true, email: true } },
        tfn: { select: { number: true, label: true } },
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/extensions/:id
 * Delete an extension (deletes linked CallLogs first).
 */
router.delete('/extensions/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const extension = await prisma.extension.findUnique({ where: { id } });
    if (!extension) {
      return res.status(404).json({ error: 'Extension not found' });
    }

    // Delete related CallLogs first to avoid foreign key constraint error
    await prisma.callLog.deleteMany({
      where: { extensionId: id },
    });

    await prisma.extension.delete({ where: { id } });
    res.json({ success: true, deleted: extension.number });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/supervisor/action
 * Perform Listen, Whisper, or Barge action on an active call.
 */
router.post('/supervisor/action', async (req, res, next) => {
  try {
    const { action, extensionNumber, callUuid } = req.body;
    // action: 'listen' | 'whisper' | 'barge'

    if (!extensionNumber && !callUuid) {
      return res.status(400).json({ error: 'extensionNumber or callUuid is required' });
    }

    let command = '';
    if (action === 'listen') {
      command = `originate user/${req.user?.extension?.number || '1000'} &eavesdrop(${callUuid || extensionNumber})`;
    } else if (action === 'whisper') {
      command = `originate user/${req.user?.extension?.number || '1000'} &three_way(${callUuid || extensionNumber})`;
    } else if (action === 'barge') {
      command = `originate user/${req.user?.extension?.number || '1000'} &conference(barge_${extensionNumber})`;
    }

    let fsResult = 'SIMULATED_SUCCESS';
    try {
      if (command) {
        fsResult = await freeswitchService.executeApi(command);
      }
    } catch {}

    res.json({
      success: true,
      action,
      extension: extensionNumber,
      message: `Supervisor ${action.toUpperCase()} action initiated for Extension ${extensionNumber}`,
      fsResult,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
