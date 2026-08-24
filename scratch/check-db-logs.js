const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.callLog.count();
  const logs = await prisma.callLog.findMany();
  console.log('CallLog count:', count);
  console.log('Logs sample:', logs);
}

main().catch(console.error).finally(() => prisma.$disconnect());
