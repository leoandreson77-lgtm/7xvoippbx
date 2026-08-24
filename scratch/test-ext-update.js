const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const ext = await prisma.extension.findFirst();
  const tfn = await prisma.tfnNumber.findFirst();
  console.log('Testing Extension:', ext.number, 'TFN:', tfn?.number);
  
  const updated = await prisma.extension.update({
    where: { id: ext.id },
    data: { tfnId: tfn.id },
    include: { tfn: true },
  });
  console.log('Updated Extension TFN:', updated.tfn?.number);
}

test().finally(() => prisma.$disconnect());
