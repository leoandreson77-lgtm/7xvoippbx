const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const ext1001 = await prisma.extension.findUnique({ where: { number: '1001' } });
  const ext1002 = await prisma.extension.findUnique({ where: { number: '1002' } });

  if (!ext1001 || !ext1002) {
    console.log('Extensions 1001/1002 not found');
    return;
  }

  await prisma.callLog.createMany({
    data: [
      {
        extensionId: ext1001.id,
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
        callUuid: 'demo-uuid-101',
      },
      {
        extensionId: ext1001.id,
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
        callUuid: 'demo-uuid-102',
      },
      {
        extensionId: ext1002.id,
        tfnNumber: '+18885752806',
        direction: 'inbound',
        callerNumber: '+18772518760',
        calleeNumber: '+18885752806',
        status: 'missed',
        duration: 0,
        region: 'US (Toll-Free)',
        startedAt: new Date(Date.now() - 3600000 * 12),
        callUuid: 'demo-uuid-103',
      },
      {
        extensionId: ext1001.id,
        tfnNumber: '+18005550199',
        direction: 'outbound',
        callerNumber: '+18005550199',
        calleeNumber: '+14155552671',
        status: 'answered',
        duration: 95,
        region: 'US (California)',
        startedAt: new Date(Date.now() - 3600000 * 20),
        answeredAt: new Date(Date.now() - 3600000 * 20 + 3000),
        endedAt: new Date(Date.now() - 3600000 * 20 + 98000),
        callUuid: 'demo-uuid-104',
      },
    ],
  });

  console.log('Successfully seeded 4 CDR call logs!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
