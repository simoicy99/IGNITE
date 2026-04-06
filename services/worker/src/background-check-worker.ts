import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { pendingToAvailable } from '@ignite/ledger';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const CHECKR_API_KEY = process.env.CHECKR_API_KEY;

const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const prisma = new PrismaClient();

interface BackgroundCheckJobData {
  userId: string;
  withdrawalId?: string;
  matchId?: string;
}

// Background check worker for Chess winnings
const backgroundCheckWorker = new Worker<BackgroundCheckJobData>(
  'background-check',
  async (job) => {
    const { userId, withdrawalId, matchId } = job.data;

    console.log(`[background-check] Processing user ${userId}`);

    // Check if user already has a cleared background check
    const existingCheck = await prisma.backgroundCheck.findFirst({
      where: { 
        userId, 
        status: 'CLEARED',
        createdAt: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } // Valid for 1 year
      },
    });

    if (existingCheck) {
      console.log(`[background-check] User ${userId} already cleared`);
      await processApproved(userId, withdrawalId, matchId);
      return { status: 'ALREADY_CLEARED' };
    }

    // If no Checkr API key, auto-approve for development
    if (!CHECKR_API_KEY) {
      console.log(`[background-check] No Checkr API key, auto-approving user ${userId}`);
      await createBackgroundCheckRecord(userId, 'CLEARED', 'Auto-approved (dev mode)');
      await processApproved(userId, withdrawalId, matchId);
      return { status: 'AUTO_APPROVED_DEV' };
    }

    // Create Checkr candidate and background check
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('User not found');

      // Create candidate in Checkr
      const candidate = await createCheckrCandidate(user);
      
      // Create background check
      const check = await createCheckrBackgroundCheck(candidate.id);
      
      // Store in database
      await prisma.backgroundCheck.create({
        data: {
          userId,
          checkrCandidateId: candidate.id,
          checkrReportId: check.id,
          status: 'PENDING',
        },
      });

      // Poll for completion (Checkr also sends webhooks)
      await pollCheckrStatus(check.id, userId, withdrawalId, matchId);

      return { status: 'PENDING', checkrReportId: check.id };
    } catch (err: any) {
      console.error(`[background-check] Error for user ${userId}:`, err.message);
      throw err;
    }
  },
  { connection: redis, concurrency: 3 }
);

async function createCheckrCandidate(user: any) {
  const res = await fetch('https://api.checkr.com/v1/candidates', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(CHECKR_API_KEY + ':').toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: user.email,
      // Add more fields if collected during registration
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Checkr candidate creation failed: ${err}`);
  }

  return res.json();
}

async function createCheckrBackgroundCheck(candidateId: string) {
  // Use 'tasker_standard' package for gig workers
  const res = await fetch('https://api.checkr.com/v1/reports', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(CHECKR_API_KEY + ':').toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      candidate_id: candidateId,
      package: 'tasker_standard', // Basic background check package
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Checkr report creation failed: ${err}`);
  }

  return res.json();
}

async function pollCheckrStatus(
  reportId: string, 
  userId: string, 
  withdrawalId?: string, 
  matchId?: string,
  maxAttempts = 60
) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 60000)); // Wait 1 minute between checks

    const res = await fetch(`https://api.checkr.com/v1/reports/${reportId}`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(CHECKR_API_KEY + ':').toString('base64')}`,
      },
    });

    if (!res.ok) continue;

    const report = await res.json();
    
    if (report.status === 'clear') {
      await prisma.backgroundCheck.updateMany({
        where: { checkrReportId: reportId },
        data: { status: 'CLEARED', completedAt: new Date() },
      });
      await processApproved(userId, withdrawalId, matchId);
      return;
    } else if (report.status === 'consider') {
      await prisma.backgroundCheck.updateMany({
        where: { checkrReportId: reportId },
        data: { status: 'REVIEW', completedAt: new Date() },
      });
      // Manual review required - notify admin
      return;
    } else if (['suspended', 'dispute', 'expired'].includes(report.status)) {
      await prisma.backgroundCheck.updateMany({
        where: { checkrReportId: reportId },
        data: { status: 'FAILED', completedAt: new Date() },
      });
      return;
    }
    // If still pending, continue polling
  }
}

async function createBackgroundCheckRecord(
  userId: string, 
  status: string, 
  notes?: string
) {
  await prisma.backgroundCheck.create({
    data: {
      userId,
      status: status as any,
      notes,
    },
  });
}

async function processApproved(
  userId: string, 
  withdrawalId?: string, 
  matchId?: string
) {
  // If this was for a match, move pending to available
  if (matchId) {
    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (match) {
      const winnerPayout = match.stakeCents * 2 * 0.95; // Pot minus 5% fee
      await pendingToAvailable(
        userId,
        winnerPayout,
        matchId,
        `background-check:${matchId}:approved`
      );
      
      // Send email notification
      const emailQueue = new Queue('email-notifications', { connection: redis });
      await emailQueue.add('send-email', {
        to: (await prisma.user.findUnique({ where: { id: userId } }))?.email,
        type: 'BACKGROUND_CHECK_CLEARED',
        data: { matchId },
      });
    }
  }

  // If this was for a withdrawal, process it
  if (withdrawalId) {
    await prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: { status: 'APPROVED', approvedAt: new Date() },
    });
  }
}

backgroundCheckWorker.on('completed', (job, result) => {
  console.log(`[background-check] Job ${job.id} completed:`, result);
});

backgroundCheckWorker.on('failed', (job, err) => {
  console.error(`[background-check] Job ${job?.id} failed:`, err.message);
});

console.log('Background check worker started');

// Graceful shutdown
process.on('SIGTERM', async () => {
  await backgroundCheckWorker.close();
  await redis.quit();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await backgroundCheckWorker.close();
  await redis.quit();
  await prisma.$disconnect();
  process.exit(0);
});

export { backgroundCheckWorker };
