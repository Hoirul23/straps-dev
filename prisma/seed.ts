
import 'dotenv/config';
import { PrismaClient } from '../app/generated/client/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding ...');

  // Create Coach 1 (Will link to Client 1 & 2)
  const coach1 = await prisma.users.upsert({
    where: { id: "C00001" },
    update: {},
    create: {
      id: "C00001",
      name: 'Coach One',
      role: 'COACH',
    },
  });

  // Create Coach 2 (Will link to Client 3)
  const coach2 = await prisma.users.upsert({
    where: { id: "C00002" },
    update: {},
    create: {
      id: "C00002",
      name: 'Coach Two',
      role: 'COACH',
    },
  });

  // Create Client 1 (Linked to Coach 1)
  const client1 = await prisma.users.upsert({
    where: { id: "U00001" },
    update: {},
    create: {
      id: "U00001",
      name: 'Client One',
      role: 'CLIENT',
      coach_id: coach1.id,
    },
  });

  // Create Client 2 (Linked to Coach 1)
  const client2 = await prisma.users.upsert({
    where: { id: "U00002" },
    update: {},
    create: {
      id: "U00002",
      name: 'Client Two',
      role: 'CLIENT',
      coach_id: coach1.id,
    },
  });

  // Create Client 3 (Linked to Coach 2)
  const client3 = await prisma.users.upsert({
    where: { id: "U00003" },
    update: {},
    create: {
      id: "U00003",
      name: 'Client Three',
      role: 'CLIENT',
      coach_id: coach2.id,
    },
  });

  console.log({ coach1, coach2, client1, client2, client3 });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
