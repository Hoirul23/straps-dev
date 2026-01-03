// @ts-nocheck
import { PrismaClient } from '../app/generated/client/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Mock Log...");
  
  // Get a user
  const user = await prisma.users.findFirst({ where: { role: 'CLIENT' } });
  if (!user) {
    console.error("No client user found to attach log to.");
    return;
  }
  
  const log = await prisma.activity_logs.create({
    data: {
      user_id: user.id,
      timestamp: new Date(),
      status: 'TEST_LOG',
      confidence: '1.0',
      details: { message: "Manual verification log" }
    }
  });

  console.log("Created Log ID:", log.id);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
