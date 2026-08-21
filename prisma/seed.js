const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const prisma = new PrismaClient();

function generateHa1(username, realm, password) {
  return crypto
    .createHash('md5')
    .update(`${username}:${realm}:${password}`)
    .digest('hex');
}

async function main() {
  console.log('🌱 Seeding database...\n');

  const realm = process.env.SIP_DOMAIN || 'kradglobal.com';
  const SALT_ROUNDS = 12;

  // ── Default Agents ──────────────────────────────
  const agents = [
    { name: 'Admin User', email: 'admin@kradglobal.com', password: 'Admin@123', role: 'admin' },
    { name: 'Agent Sameer', email: 'sameer@kradglobal.com', password: 'Agent@123', role: 'agent' },
    { name: 'Agent Priya', email: 'priya@kradglobal.com', password: 'Agent@123', role: 'agent' },
    { name: 'Agent Rahul', email: 'rahul@kradglobal.com', password: 'Agent@123', role: 'agent' },
    { name: 'Agent Anita', email: 'anita@kradglobal.com', password: 'Agent@123', role: 'agent' },
  ];

  const createdAgents = [];
  for (const agent of agents) {
    const passwordHash = await bcrypt.hash(agent.password, SALT_ROUNDS);
    const created = await prisma.agent.upsert({
      where: { email: agent.email },
      update: {},
      create: {
        name: agent.name,
        email: agent.email,
        passwordHash,
        role: agent.role,
        enabled: true,
        status: 'OFFLINE',
      },
    });
    createdAgents.push(created);
    console.log(`  ✓ Agent: ${created.name} (${created.email}) [${created.role}]`);
  }

  // ── Multiple SIP Providers / Trunks ────────────
  const trunks = [
    {
      id: 'telnyx-primary',
      name: 'Telnyx US Toll-Free Trunk',
      provider: 'telnyx',
      host: 'sip.telnyx.com',
      port: 5060,
      username: 'telnyx_sip_user',
      password: 'telnyx_sip_pass',
      didNumber: '+18005550199',
      realm: 'sip.telnyx.com',
      enabled: true,
      status: 'UNCONFIGURED',
    },
    {
      id: 'twilio-elastic',
      name: 'Twilio 7xvoip Elastic SIP Trunk',
      provider: 'twilio',
      host: '7xvoip.pstn.twilio.com',
      port: 5060,
      username: '7xvoip',
      password: '7Xvoip@22001!',
      didNumber: '+18885752806',
      realm: '7xvoip.pstn.twilio.com',
      enabled: true,
      status: 'CONFIGURED',
    },
    {
      id: 'airtel-india-sip',
      name: 'Airtel Enterprise SIP Gateway',
      provider: 'generic',
      host: 'sip.airtel.in',
      port: 5060,
      username: 'airtel_sip_user',
      password: 'airtel_sip_pass',
      didNumber: '+911145678900',
      realm: 'sip.airtel.in',
      enabled: true,
      status: 'UNCONFIGURED',
    },
  ];

  const createdTrunks = [];
  for (const tr of trunks) {
    const created = await prisma.sipTrunk.upsert({
      where: { id: tr.id },
      update: {
        name: tr.name,
        provider: tr.provider,
        host: tr.host,
        port: tr.port,
        username: tr.username,
        password: tr.password,
        didNumber: tr.didNumber,
        realm: tr.realm,
        enabled: tr.enabled,
        status: tr.status,
      },
      create: tr,
    });
    createdTrunks.push(created);
    console.log(`  ✓ SIP Trunk: ${created.name} (${created.provider} → ${created.host})`);
  }

  // ── Default TFN / DID Numbers Linked to Providers
  const tfns = [
    { number: '+18005550199', label: 'Sales Toll-Free (+1800)', trunkId: 'telnyx-primary' },
    { number: '+18885752806', label: 'Twilio Toll-Free (+1888)', trunkId: 'twilio-elastic' },
    { number: '+911145678900', label: 'India Support DID', trunkId: 'airtel-india-sip' },
  ];

  const createdTfns = [];
  for (const t of tfns) {
    const created = await prisma.tfnNumber.upsert({
      where: { number: t.number },
      update: {
        label: t.label,
        trunkId: t.trunkId,
      },
      create: {
        number: t.number,
        label: t.label,
        trunkId: t.trunkId,
      },
    });
    createdTfns.push(created);
    console.log(`  ✓ TFN Number: ${created.number} (${created.label} → Trunk: ${t.trunkId})`);
  }

  // ── Default Extensions ──────────────────────────
  const extensions = [
    { number: '1000', sipPassword: 'Ext1000@Sip', agentIndex: 0, tfnIndex: null }, // Admin User
    { number: '1001', sipPassword: 'Ext1001@Sip', agentIndex: 1, tfnIndex: 0 },    // Agent Sameer (+18005550199)
    { number: '1002', sipPassword: 'Ext1002@Sip', agentIndex: 2, tfnIndex: 1 },    // Agent Priya (+18005550200)
    { number: '1003', sipPassword: 'Ext1003@Sip', agentIndex: 3, tfnIndex: 2 },    // Agent Rahul (+911145678900)
    { number: '1004', sipPassword: 'Ext1004@Sip', agentIndex: 4, tfnIndex: 0 },    // Agent Anita (+18005550199)
  ];

  for (const ext of extensions) {
    const sipPasswordHash = await bcrypt.hash(ext.sipPassword, SALT_ROUNDS);
    const sipHa1 = generateHa1(ext.number, realm, ext.sipPassword);
    const tfnId = ext.tfnIndex !== null ? createdTfns[ext.tfnIndex].id : null;

    const extRecord = await prisma.extension.upsert({
      where: { number: ext.number },
      update: {},
      create: {
        number: ext.number,
        sipUsername: ext.number,
        sipPasswordHash,
        sipHa1,
        realm,
        agentId: createdAgents[ext.agentIndex].id,
        tfnId,
        enabled: true,
        registered: false,
        maxLoginLocations: 1,
        callsReceiveOn: 'Extension',
      },
    });
    const assignedTfn = ext.tfnIndex !== null ? createdTfns[ext.tfnIndex].number : 'No TFN';
    console.log(`  ✓ Extension: ${ext.number} → ${createdAgents[ext.agentIndex].name} [TFN: ${assignedTfn}]`);

    // ── Seed Sample CDRs for this extension
    if (ext.number === '1001') {
      await prisma.callLog.createMany({
        data: [
          {
            extensionId: extRecord.id,
            tfnNumber: '+18005550199',
            direction: 'inbound',
            callerNumber: '+12176266046',
            calleeNumber: '+18005550199',
            status: 'answered',
            duration: 184,
            region: 'US (Illinois)',
            startedAt: new Date(Date.now() - 3600000 * 2),
            answeredAt: new Date(Date.now() - 3600000 * 2 + 5000),
            endedAt: new Date(Date.now() - 3600000 * 2 + 189000),
            callUuid: 'seed-uuid-1',
          },
          {
            extensionId: extRecord.id,
            tfnNumber: '+18005550199',
            direction: 'outbound',
            callerNumber: '+18005550199',
            calleeNumber: '+13252891153',
            status: 'answered',
            duration: 312,
            region: 'US (Texas)',
            startedAt: new Date(Date.now() - 3600000 * 5),
            answeredAt: new Date(Date.now() - 3600000 * 5 + 8000),
            endedAt: new Date(Date.now() - 3600000 * 5 + 320000),
            callUuid: 'seed-uuid-2',
          },
          {
            extensionId: extRecord.id,
            tfnNumber: '+18005550199',
            direction: 'inbound',
            callerNumber: '+18772518760',
            calleeNumber: '+18005550199',
            status: 'missed',
            duration: 0,
            region: 'US (Toll-Free)',
            startedAt: new Date(Date.now() - 3600000 * 12),
            callUuid: 'seed-uuid-3',
          },
        ],
      });
    } else if (ext.number === '1002') {
      await prisma.callLog.createMany({
        data: [
          {
            extensionId: extRecord.id,
            tfnNumber: '+18005550200',
            direction: 'inbound',
            callerNumber: '+18552533640',
            calleeNumber: '+18005550200',
            status: 'answered',
            duration: 425,
            region: 'US (Support)',
            startedAt: new Date(Date.now() - 3600000 * 1),
            answeredAt: new Date(Date.now() - 3600000 * 1 + 4000),
            endedAt: new Date(Date.now() - 3600000 * 1 + 429000),
            callUuid: 'seed-uuid-4',
          },
        ],
      });
    }
  }

  console.log('\n✅ Seed complete with CDR Call Records!');
  console.log('\n📋 Default login credentials:');
  console.log('  Extension 1001 / Password: Agent@123 (Agent Sameer - TFN: +18005550199)');
  console.log('  Extension 1002 / Password: Agent@123 (Agent Priya - TFN: +18005550200)');
  console.log('  Extension 1003 / Password: Agent@123 (Agent Rahul - TFN: +911145678900)');
  console.log('  Extension 1004 / Password: Agent@123 (Agent Anita - TFN: +18005550199)');
  console.log('  Admin: admin@kradglobal.com / Admin@123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
