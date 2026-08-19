const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const prisma = new PrismaClient();

/**
 * Create a test agent and extension for testing.
 */
async function createTestAgent(overrides = {}) {
  const password = overrides.password || 'TestPass@123';
  const passwordHash = await bcrypt.hash(password, 10);
  const extNumber = overrides.extension || `9${Math.floor(Math.random() * 900 + 100)}`;
  const sipPassword = `SipPass@${extNumber}`;
  const realm = 'kradglobal.com';

  const agent = await prisma.agent.create({
    data: {
      name: overrides.name || 'Test Agent',
      email: overrides.email || `test${Date.now()}@test.com`,
      passwordHash,
      role: overrides.role || 'agent',
      enabled: overrides.enabled !== undefined ? overrides.enabled : true,
      status: 'OFFLINE',
    },
  });

  const sipPasswordHash = await bcrypt.hash(sipPassword, 10);
  const sipHa1 = crypto.createHash('md5').update(`${extNumber}:${realm}:${sipPassword}`).digest('hex');

  const extension = await prisma.extension.create({
    data: {
      number: extNumber,
      sipUsername: extNumber,
      sipPasswordHash,
      sipHa1,
      realm,
      agentId: agent.id,
      enabled: overrides.extEnabled !== undefined ? overrides.extEnabled : true,
      registered: false,
    },
  });

  return { agent, extension, password, sipPassword };
}

/**
 * Create a test admin.
 */
async function createTestAdmin(overrides = {}) {
  return createTestAgent({ ...overrides, role: 'admin' });
}

/**
 * Clean up all test data.
 */
async function cleanupTestData() {
  await prisma.callLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.extension.deleteMany();
  await prisma.agent.deleteMany();
}

/**
 * Disconnect Prisma.
 */
async function disconnectDb() {
  await prisma.$disconnect();
}

module.exports = {
  prisma,
  createTestAgent,
  createTestAdmin,
  cleanupTestData,
  disconnectDb,
};
