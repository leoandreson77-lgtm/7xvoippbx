const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const agents = await prisma.agent.count();
  const extensions = await prisma.extension.count();
  const tfns = await prisma.tfnNumber.count();
  const trunks = await prisma.sipTrunk.count();
  const callLogs = await prisma.callLog.count();

  console.log('=== DATABASE RECORD COUNTS ===');
  console.log(`Agents:       ${agents}`);
  console.log(`Extensions:   ${extensions}`);
  console.log(`TFNs / DIDs:  ${tfns}`);
  console.log(`SIP Trunks:   ${trunks}`);
  console.log(`Call Logs:    ${callLogs}`);

  const recentLogs = await prisma.callLog.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
  console.log('\n--- Recent Call CDR Logs ---');
  console.log(JSON.stringify(recentLogs, null, 2));
}

main().finally(() => prisma.$disconnect());
