import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Allowlist emails
  const allowlistEmails = [
    { email: 'test1@example.com', note: 'Test user 1' },
    { email: 'test2@example.com', note: 'Test user 2' },
    { email: 'admin@ignite.gg', note: 'Admin user' },
  ];

  for (const entry of allowlistEmails) {
    await prisma.allowlistEmail.upsert({
      where: { email: entry.email },
      update: {},
      create: entry,
    });
  }
  console.log('Created allowlist emails');

  // Match templates
  const templates = [
    {
      game: 'CHESS',
      name: 'Chess 5min Blitz',
      metadata: {
        timeControl: '5+0',
        variant: 'standard',
        platform: 'chess.com',
        description: '5 minute blitz game on Chess.com',
      },
      isActive: true,
    },
    {
      game: 'CHESS',
      name: 'Chess 10min Rapid',
      metadata: {
        timeControl: '10+0',
        variant: 'standard',
        platform: 'chess.com',
        description: '10 minute rapid game on Chess.com',
      },
      isActive: true,
    },
    {
      game: 'NBA2K',
      name: 'NBA 2K Play Now',
      metadata: {
        mode: 'Play Now',
        quarters: 4,
        quarterLength: 5,
        description: 'Play Now mode, 4x5min quarters',
        platforms: ['PS5', 'XBOX'],
      },
      isActive: true,
    },
  ];

  for (const template of templates) {
    const existing = await prisma.matchTemplate.findFirst({
      where: { game: template.game, name: template.name },
    });
    if (!existing) {
      await prisma.matchTemplate.create({ data: template });
    }
  }
  console.log('Created match templates');

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
