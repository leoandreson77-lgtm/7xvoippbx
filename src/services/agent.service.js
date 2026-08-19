const { PrismaClient } = require('@prisma/client');
const { createLogger } = require('../utils/logger');
const { AGENT_STATUS } = require('../constants');

const prisma = new PrismaClient();
const log = createLogger('agent-service');

/**
 * Get agent profile with extension info.
 */
async function getAgentProfile(agentId) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      extension: {
        select: {
          number: true,
          enabled: true,
          registered: true,
          lastRegisteredAt: true,
          tfn: {
            select: {
              number: true,
              label: true,
            },
          },
        },
      },
    },
  });

  if (!agent) {
    const err = new Error('Agent not found');
    err.statusCode = 404;
    throw err;
  }

  return {
    id: agent.id,
    name: agent.name,
    email: agent.email,
    role: agent.role,
    status: agent.status,
    enabled: agent.enabled,
    lastLoginAt: agent.lastLoginAt,
    extension: agent.extension,
  };
}

/**
 * Update agent status.
 */
async function updateStatus(agentId, status) {
  if (!Object.values(AGENT_STATUS).includes(status)) {
    const err = new Error(`Invalid status: ${status}`);
    err.statusCode = 400;
    throw err;
  }

  const agent = await prisma.agent.update({
    where: { id: agentId },
    data: { status },
  });

  log.info(`Agent ${agentId} status → ${status}`);
  return agent;
}

/**
 * Get recent call logs for an agent's extension.
 */
async function getRecentCalls(agentId, limit = 20) {
  const extension = await prisma.extension.findUnique({
    where: { agentId },
  });

  if (!extension) return [];

  return prisma.callLog.findMany({
    where: { extensionId: extension.id },
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
}

/**
 * List all agents (admin view).
 */
async function listAgents() {
  return prisma.agent.findMany({
    include: {
      extension: {
        select: {
          number: true,
          enabled: true,
          registered: true,
          lastRegisteredAt: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });
}

module.exports = {
  getAgentProfile,
  updateStatus,
  getRecentCalls,
  listAgents,
};
