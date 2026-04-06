import { Worker, Queue, Job } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { pendingToAvailable, settleMatch, lockDisputeBond } from '@ignite/ledger';
import { calcWinnerPayout, calcDisputeBond } from '@ignite/shared';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

const prisma = new PrismaClient();

// ─── Job Data Types ─────────────────────────────────────────────────────────

interface ChessVerifyJobData {
  matchId: string;
  winnerId: string;
  loserId: string;
  stakeCents: number;
}

interface DisputeTimeoutJobData {
  matchId: string;
  winnerId: string;
  loserId: string;
  stakeCents: number;
}

interface NoShowTimeoutJobData {
  matchId: string;
  expectedPlayerId: string;
  submitterId: string;
  stakeCents: number;
}

// ─── chess-verify Worker ────────────────────────────────────────────────────
/**
 * After both players agree on a chess result, this job:
 * 1. Verifies the game was played (stub: always passes for MVP)
 * 2. Moves winner's PENDING → AVAILABLE
 * 3. Updates match status to SETTLED
 */
const chessVerifyWorker = new Worker<ChessVerifyJobData>(
  'chess-verify',
  async (job: Job<ChessVerifyJobData>) => {
    const { matchId, winnerId, loserId, stakeCents } = job.data;

    console.log(`[chess-verify] Processing match ${matchId}, winner: ${winnerId}`);

    // Verify match exists and is in VERIFIED state
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { proofs: true },
    });

    if (!match) {
      console.error(`[chess-verify] Match ${matchId} not found`);
      throw new Error(`Match ${matchId} not found`);
    }

    if (!['VERIFIED'].includes(match.status)) {
      console.log(`[chess-verify] Match ${matchId} is in status ${match.status}, skipping`);
      return { skipped: true, reason: `Wrong status: ${match.status}` };
    }

    // ── Stub Verification ──
    // In production: call Chess.com/Lichess API to verify game was played
    // Check: game URL matches, time control matches, players match usernames
    // For MVP: always approve
    const verificationPassed = await verifyChessGame(match, job.log);

    if (!verificationPassed) {
      // If verification fails, flag for manual review
      console.warn(`[chess-verify] Verification failed for match ${matchId} - flagging for admin review`);

      await prisma.match.update({
        where: { id: matchId },
        data: { status: 'DISPUTED' },
      });

      // Create a dispute automatically
      await prisma.dispute.upsert({
        where: { matchId },
        create: {
          matchId,
          openedById: winnerId, // System-opened dispute
          bondCents: 0,
          bondLocked: false,
          reason: 'Automated verification failed - requires admin review',
        },
        update: {},
      });

      return { verified: false, matchId };
    }

    // Move winner's PENDING → AVAILABLE
    const winnerPayout = calcWinnerPayout(stakeCents);

    try {
      await pendingToAvailable(
        winnerId,
        winnerPayout,
        matchId,
        `verify:${matchId}:pending-to-available`
      );
    } catch (err: any) {
      // If idempotency key already exists, it's fine
      if (!err.message?.includes('already exists')) {
        throw err;
      }
      console.log(`[chess-verify] Payout already processed for match ${matchId}`);
    }

    // Update match status to SETTLED
    await prisma.match.update({
      where: { id: matchId },
      data: { status: 'SETTLED' },
    });

    console.log(
      `[chess-verify] Match ${matchId} settled. Winner ${winnerId} payout: $${(winnerPayout / 100).toFixed(2)}`
    );

    return { verified: true, matchId, winnerId, winnerPayout };
  },
  {
    connection: redis,
    concurrency: 10,
    limiter: {
      max: 50,
      duration: 60000, // Max 50 jobs per minute
    },
  }
);

/**
 * Stub chess game verification.
 * In production: calls Chess.com or Lichess API to verify:
 * - Game was played between the two users
 * - Time control matches template
 * - Result matches what was submitted
 */
async function verifyChessGame(match: any, log: any): Promise<boolean> {
  if (!match.chessLink) {
    log.info('No chess link provided, skipping link verification');
    // For MVP, we trust the result even without link
    return true;
  }

  // TODO: Implement real verification
  // const gameId = extractGameIdFromUrl(match.chessLink);
  // const game = await chessComClient.getGame(gameId);
  // return validateGame(game, match);

  log.info({ chessLink: match.chessLink }, 'Chess game verification stub - passing');
  return true;
}

// ─── dispute-timeout Worker ─────────────────────────────────────────────────
/**
 * Auto-confirms NBA 2K results after the dispute window closes.
 * If no dispute was opened within 10 minutes of result submission,
 * the original result is accepted.
 */
const disputeTimeoutWorker = new Worker<DisputeTimeoutJobData>(
  'dispute-timeout',
  async (job: Job<DisputeTimeoutJobData>) => {
    const { matchId, winnerId, loserId, stakeCents } = job.data;

    console.log(`[dispute-timeout] Auto-confirming match ${matchId} after dispute window`);

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { dispute: true },
    });

    if (!match) {
      console.error(`[dispute-timeout] Match ${matchId} not found`);
      throw new Error(`Match ${matchId} not found`);
    }

    // Check if a dispute was filed (if so, don't auto-confirm)
    if (match.dispute) {
      console.log(`[dispute-timeout] Match ${matchId} has dispute, skipping auto-confirm`);
      return { skipped: true, reason: 'Dispute exists' };
    }

    if (match.status !== 'SUBMITTED') {
      console.log(`[dispute-timeout] Match ${matchId} is ${match.status}, skipping auto-confirm`);
      return { skipped: true, reason: `Wrong status: ${match.status}` };
    }

    // Auto-confirm: settle the match
    try {
      await settleMatch(winnerId, loserId, stakeCents, matchId);
    } catch (err: any) {
      if (!err.message?.includes('already')) throw err;
      console.log(`[dispute-timeout] Match ${matchId} already settled`);
    }

    await prisma.match.update({
      where: { id: matchId },
      data: { status: 'VERIFIED' },
    });

    // Immediately move PENDING → AVAILABLE (NBA2K auto-confirm is trusted)
    const winnerPayout = calcWinnerPayout(stakeCents);

    try {
      await pendingToAvailable(
        winnerId,
        winnerPayout,
        matchId,
        `verify:${matchId}:timeout-auto-confirm`
      );
    } catch (err: any) {
      if (!err.message?.includes('already')) throw err;
    }

    await prisma.match.update({
      where: { id: matchId },
      data: { status: 'SETTLED' },
    });

    console.log(
      `[dispute-timeout] Match ${matchId} auto-confirmed. Winner ${winnerId} payout: $${(winnerPayout / 100).toFixed(2)}`
    );

    return { autoConfirmed: true, matchId, winnerId, winnerPayout };
  },
  {
    connection: redis,
    concurrency: 20,
  }
);

// ─── no-show-timeout Worker ─────────────────────────────────────────────────
/**
 * Handles players who don't submit results within the timeout window.
 * If Player A submits and Player B doesn't respond within 10 minutes,
 * Player B forfeits and Player A wins automatically.
 */
const noShowTimeoutWorker = new Worker<NoShowTimeoutJobData>(
  'no-show-timeout',
  async (job: Job<NoShowTimeoutJobData>) => {
    const { matchId, expectedPlayerId, submitterId, stakeCents } = job.data;

    console.log(`[no-show-timeout] Checking match ${matchId} for no-show`);

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { 
        proofs: true,
        dispute: true,
      },
    });

    if (!match) {
      console.error(`[no-show-timeout] Match ${matchId} not found`);
      throw new Error(`Match ${matchId} not found`);
    }

    // If match is already settled or disputed, skip
    if (['SETTLED', 'DISPUTED', 'RESOLVED', 'CANCELED'].includes(match.status)) {
      console.log(`[no-show-timeout] Match ${matchId} already resolved (${match.status}), skipping`);
      return { skipped: true, reason: `Already resolved: ${match.status}` };
    }

    // Check if expected player submitted
    const expectedPlayerProof = match.proofs.find(
      (p) => p.userId === expectedPlayerId && 
      (p.type === 'CHESS_RESULT' || p.type === 'NBA2K_RESULT')
    );

    if (expectedPlayerProof) {
      console.log(`[no-show-timeout] Player ${expectedPlayerId} submitted on time, skipping`);
      return { skipped: true, reason: 'Player submitted on time' };
    }

    // No-show detected: expected player didn't submit
    console.log(`[no-show-timeout] No-show detected for player ${expectedPlayerId} in match ${matchId}`);

    // Forfeit: submitter wins automatically
    const winnerId = submitterId;
    const loserId = expectedPlayerId;

    try {
      // Settle the match
      await settleMatch(winnerId, loserId, stakeCents, matchId);
    } catch (err: any) {
      if (!err.message?.includes('already')) throw err;
      console.log(`[no-show-timeout] Match ${matchId} already settled`);
    }

    // Update match status
    await prisma.match.update({
      where: { id: matchId },
      data: { 
        status: 'VERIFIED',
        metadata: {
          ...(match.metadata as object || {}),
          noShowForfeit: true,
          forfeitingPlayerId: expectedPlayerId,
        },
      },
    });

    // Move PENDING → AVAILABLE for winner
    const winnerPayout = calcWinnerPayout(stakeCents);

    try {
      await pendingToAvailable(
        winnerId,
        winnerPayout,
        matchId,
        `verify:${matchId}:no-show-forfeit`
      );
    } catch (err: any) {
      if (!err.message?.includes('already')) throw err;
    }

    await prisma.match.update({
      where: { id: matchId },
      data: { status: 'SETTLED' },
    });

    console.log(
      `[no-show-timeout] Match ${matchId} settled by forfeit. Winner ${winnerId} payout: $${(winnerPayout / 100).toFixed(2)}`
    );

    return { 
      noShowForfeit: true, 
      matchId, 
      winnerId, 
      loserId: expectedPlayerId,
      winnerPayout 
    };
  },
  {
    connection: redis,
    concurrency: 20,
  }
);

// ─── Event Handlers ──────────────────────────────────────────────────────────

chessVerifyWorker.on('completed', (job, result) => {
  console.log(`[chess-verify] Job ${job.id} completed:`, result);
});

chessVerifyWorker.on('failed', (job, err) => {
  console.error(`[chess-verify] Job ${job?.id} failed:`, err.message);
});

chessVerifyWorker.on('error', (err) => {
  console.error('[chess-verify] Worker error:', err);
});

disputeTimeoutWorker.on('completed', (job, result) => {
  console.log(`[dispute-timeout] Job ${job.id} completed:`, result);
});

disputeTimeoutWorker.on('failed', (job, err) => {
  console.error(`[dispute-timeout] Job ${job?.id} failed:`, err.message);
});

disputeTimeoutWorker.on('error', (err) => {
  console.error('[dispute-timeout] Worker error:', err);
});

noShowTimeoutWorker.on('completed', (job, result) => {
  console.log(`[no-show-timeout] Job ${job.id} completed:`, result);
});

noShowTimeoutWorker.on('failed', (job, err) => {
  console.error(`[no-show-timeout] Job ${job?.id} failed:`, err.message);
});

noShowTimeoutWorker.on('error', (err) => {
  console.error('[no-show-timeout] Worker error:', err);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

async function gracefulShutdown() {
  console.log('Shutting down workers...');

  await Promise.all([
    chessVerifyWorker.close(),
    disputeTimeoutWorker.close(),
    noShowTimeoutWorker.close(),
  ]);

  await redis.quit();
  await prisma.$disconnect();

  console.log('Workers shut down cleanly');
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

console.log('Ignite worker started');
console.log('  - chess-verify queue: listening');
console.log('  - dispute-timeout queue: listening');
console.log('  - no-show-timeout queue: listening');

export { noShowTimeoutWorker };
