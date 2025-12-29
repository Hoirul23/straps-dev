// @ts-nocheck
import { PrismaClient } from '../app/generated/client/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log("Checking Activity Logs...");
  const logs = await prisma.activity_logs.findMany({
    take: 10,
    orderBy: {
      timestamp: 'desc',
    },
    include: {
      user: {
        select: { name: true }
      }
    }
  });

  if (logs.length === 0) {
    console.log("No logs found.");
  } else {
    console.log(`Found ${logs.length} logs:`);
    logs.forEach(log => {
      console.log(`[${log.timestamp?.toISOString()}] User: ${log.user?.name || log.user_id} | Status: ${log.status} | Details: ${JSON.stringify(log.details)}`);
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
