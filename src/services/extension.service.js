const { PrismaClient } = require('@prisma/client');
const { hashPassword, generateHa1 } = require('../utils/crypto');
const { createLogger } = require('../utils/logger');

const prisma = new PrismaClient();
const log = createLogger('extension-service');

/**
 * Create a new extension.
 */
async function createExtension({ number, sipPassword, realm, agentId, tfnId }) {
  // Check uniqueness
  const existing = await prisma.extension.findUnique({ where: { number } });
  if (existing) {
    const err = new Error(`Extension ${number} already exists`);
    err.statusCode = 409;
    throw err;
  }

  // If agentId provided, check agent exists and doesn't already have an extension
  if (agentId) {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: { extension: true },
    });
    if (!agent) {
      const err = new Error('Agent not found');
      err.statusCode = 404;
      throw err;
    }
    if (agent.extension) {
      const err = new Error(`Agent already has extension ${agent.extension.number}`);
      err.statusCode = 409;
      throw err;
    }
  }

  const sipPasswordHash = await hashPassword(sipPassword);
  const sipHa1 = generateHa1(number, realm, sipPassword);

  const extension = await prisma.extension.create({
    data: {
      number,
      sipUsername: number,
      sipPasswordHash,
      sipHa1,
      realm,
      agentId,
      tfnId: tfnId || null,
      enabled: true,
      registered: false,
    },
    include: {
      agent: { select: { id: true, name: true, email: true } },
      tfn: { select: { id: true, number: true, label: true } },
    },
  });

  log.info(`Extension ${number} created`);
  return extension;
}

/**
 * Update extension (enable/disable, reassign agent, assign TFN).
 */
async function updateExtension(id, data) {
  const updateData = {};

  if (typeof data.enabled === 'boolean') {
    updateData.enabled = data.enabled;
  }

  if (data.tfnId !== undefined) {
    updateData.tfnId = data.tfnId || null;
  }

  if (data.agentId !== undefined) {
    if (data.agentId !== null) {
      const existingExt = await prisma.extension.findUnique({
        where: { agentId: data.agentId },
      });
      if (existingExt && existingExt.id !== id) {
        const err = new Error('Agent already has an extension assigned');
        err.statusCode = 409;
        throw err;
      }
    }
    updateData.agentId = data.agentId;
  }

  if (data.sipPassword) {
    const ext = await prisma.extension.findUnique({ where: { id } });
    if (!ext) {
      const err = new Error('Extension not found');
      err.statusCode = 404;
      throw err;
    }
    updateData.sipPasswordHash = await hashPassword(data.sipPassword);
    updateData.sipHa1 = generateHa1(ext.number, ext.realm, data.sipPassword);
  }

  const extension = await prisma.extension.update({
    where: { id },
    data: updateData,
    include: {
      agent: { select: { id: true, name: true, email: true } },
      tfn: { select: { id: true, number: true, label: true } },
    },
  });

  log.info(`Extension ${extension.number} updated`, updateData);
  return extension;
}

/**
 * Delete an extension.
 */
async function deleteExtension(id) {
  const extension = await prisma.extension.delete({ where: { id } });
  log.info(`Extension ${extension.number} deleted`);
  return extension;
}

/**
 * List all extensions with agent info, TFN info, and registration status.
 */
async function listExtensions() {
  return prisma.extension.findMany({
    include: {
      agent: { select: { id: true, name: true, email: true, status: true } },
      tfn: { select: { id: true, number: true, label: true } },
    },
    orderBy: { number: 'asc' },
  });
}

/**
 * Get extension by number.
 */
async function getByNumber(number) {
  return prisma.extension.findUnique({
    where: { number },
    include: {
      agent: { select: { id: true, name: true } },
      tfn: { select: { id: true, number: true, label: true } },
    },
  });
}

/**
 * Update registration status from FreeSWITCH events.
 */
async function updateRegistrationStatus(extensionNumber, registered, ip) {
  try {
    await prisma.extension.update({
      where: { number: extensionNumber },
      data: {
        registered,
        registrationIp: registered ? ip : null,
        lastRegisteredAt: registered ? new Date() : undefined,
      },
    });
    log.info(`Extension ${extensionNumber} registration: ${registered ? 'REGISTERED' : 'UNREGISTERED'}`);
  } catch (err) {
    log.error(`Failed to update registration for ${extensionNumber}`, err.message);
  }
}

module.exports = {
  createExtension,
  updateExtension,
  deleteExtension,
  listExtensions,
  getByNumber,
  updateRegistrationStatus,
};
