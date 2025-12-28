
const { PrismaClient } = require('./app/generated/client');
const prisma = new PrismaClient();

async function main() {
  const menus = await prisma.training_menus.findMany({
    orderBy: { id: 'desc' },
    take: 1
  });

  if (menus.length > 0) {
    console.log("Latest Menu:", JSON.stringify(menus[0], null, 2));
    const ex = menus[0].exercises;
    if (typeof ex === 'string') {
        console.log("Exercises (parsed):", JSON.stringify(JSON.parse(ex), null, 2));
    } else {
        console.log("Exercises (raw):", JSON.stringify(ex, null, 2));
    }
  } else {
    console.log("No menus found.");
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
