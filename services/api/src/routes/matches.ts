import { FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import {
  AcceptMatchSchema,
  SubmitChessLinkSchema,
  SubmitChessResultSchema,
  SubmitNba2kResultSchema,
  ConfirmNba2kResultSchema,
  calcDisputeBond,
  calcPot,
  DISPUTE_WINDOW_MINUTES,
} from '@ignite/shared';
import {
  lockFunds,
  unlockFunds,
  getAllBalances,
  settleMatch,
  lockDisputeBond,
} from '@ignite/ledger';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
const chessVerifyQueue = new Queue('chess-verify', { connection: redis });
const disputeTimeoutQueue = new Queue('dispute-timeout', { connection: redis });

const matchRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /matches
   * List open matches (available to accept)
   */
  fastify.get(
    '/matches',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const query = request.query as { game?: string; cursor?: string; limit?: string };
      const limit = Math.min(parseInt(query.limit ?? '20'), 100);

      const matches = await prisma.match.findMany({
        where: {
          status: 'FUNDED',
          creatorId: { not: request.userId }, // Don't show own matches
          game: query.game ?? undefined,
        },
        take: limit + 1,
        cursor: query.cursor ? { id: query.cursor } : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          template: true,
          creator: { select: { id: true, handle: true } },
        },
      });

      const hasMore = matches.length > limit;
      const items = matches.slice(0, limit);
      const nextCursor = hasMore ? items[items.length - 1].id : null;

      return reply.send({
        success: true,
        data: { items, nextCursor },
      });
    }
  );

  /**
   * GET /matches/:id
   * Get match details
   */
  fastify.get(
    '/matches/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const match = await prisma.match.findUnique({
        where: { id },
        include: {
          template: true,
          creator: { select: { id: true, handle: true, chessUsername: true, psnTag: true, xboxTag: true } },
          accepter: { select: { id: true, handle: true, chessUsername: true, psnTag: true, xboxTag: true } },
          proofs: true,
          dispute: true,
          post: { select: { id: true } },
        },
      });

      if (!match) {
        return reply.status(404).send({ success: false, error: 'Match not found' });
      }

      return reply.send({ success: true, data: match });
    }
  );

  /**
   * POST /matches/:id/accept
   * Accept an open challenge
   * Requires geo gate + sufficient funds
   */
  fastify.post(
    '/matches/:id/accept',
    { preHandler: [fastify.authenticate, fastify.geoGate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = AcceptMatchSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: result.error.flatten(),
        });
      }

      const match = await prisma.match.findUnique({ where: { id } });
      if (!match) {
        return reply.status(404).send({ success: false, error: 'Match not found' });
      }

      if (match.status !== 'FUNDED') {
        return reply.status(400).send({ success: false, error: 'Match is not available to accept' });
      }

      if (match.creatorId === request.userId) {
        return reply.status(400).send({ success: false, error: 'Cannot accept your own challenge' });
      }

      // Check balance
      const balances = await getAllBalances(request.userId);
      if (balances.available < match.stakeCents) {
        return reply.status(400).send({
          success: false,
          error: `Insufficient funds. Available: $${(balances.available / 100).toFixed(2)}, Required: $${(match.stakeCents / 100).toFixed(2)}`,
        });
      }

      // Lock accepter's funds
      await lockFunds(
        request.userId,
        match.stakeCents,
        match.id,
        `lock:${match.id}:accepter`
      );

      // Update match status
      const updated = await prisma.match.update({
        where: { id },
        data: {
          accepterId: request.userId,
          status: 'ACCEPTED',
        },
        include: {
          template: true,
          creator: { select: { id: true, handle: true } },
          accepter: { select: { id: true, handle: true } },
        },
      });

      return reply.send({ success: true, data: updated });
    }
  );

  /**
   * POST /matches/:id/cancel
   * Cancel a match (only creator can cancel, only if not accepted)
   */
  fastify.post(
    '/matches/:id/cancel',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const match = await prisma.match.findUnique({ where: { id } });
      if (!match) {
        return reply.status(404).send({ success: false, error: 'Match not found' });
      }

      if (match.creatorId !== request.userId) {
        return reply.status(403).send({ success: false, error: 'Only the creator can cancel this match' });
      }

      if (!['CREATED', 'FUNDED'].includes(match.status)) {
        return reply.status(400).send({ success: false, error: 'Match cannot be canceled at this stage' });
      }

      // Unlock creator's funds
      await unlockFunds(
        request.userId,
        match.stakeCents,
        match.id,
        `unlock:${match.id}:cancel`
      );

      await prisma.match.update({
        where: { id },
        data: { status: 'CANCELED' },
      });

      return reply.send({ success: true, message: 'Match canceled and funds returned' });
    }
  );

  // =================== CHESS FLOW ===================

  /**
   * POST /matches/:id/chess-link
   * Submit the Chess.com/Lichess game link
   */
  fastify.post(
    '/matches/:id/chess-link',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = SubmitChessLinkSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: result.error.flatten(),
        });
      }

      const match = await prisma.match.findUnique({ where: { id } });
      if (!match) return reply.status(404).send({ success: false, error: 'Match not found' });
      if (match.game !== 'CHESS') return reply.status(400).send({ success: false, error: 'Not a chess match' });

      if (match.creatorId !== request.userId && match.accepterId !== request.userId) {
        return reply.status(403).send({ success: false, error: 'Not a participant of this match' });
      }

      if (!['ACCEPTED', 'IN_PROGRESS'].includes(match.status)) {
        return reply.status(400).send({ success: false, error: 'Match is not in the correct state' });
      }

      const { chessLink } = result.data;

      // Store proof of the link submission
      await prisma.proof.upsert({
        where: { matchId_userId_type: { matchId: id, userId: request.userId, type: 'CHESS_LINK' } },
        create: { matchId: id, userId: request.userId, type: 'CHESS_LINK', url: chessLink },
        update: { url: chessLink },
      });

      // Update match to IN_PROGRESS and set chess link
      await prisma.match.update({
        where: { id },
        data: {
          chessLink,
          status: 'IN_PROGRESS',
        },
      });

      return reply.send({
        success: true,
        message: 'Chess game link submitted. Your opponent needs to confirm.',
      });
    }
  );

  /**
   * POST /matches/:id/chess-result
   * Submit chess match result (I_WON or I_LOST)
   * When both players submit and agree → settle
   * When they disagree → mark as DISPUTED
   */
  fastify.post(
    '/matches/:id/chess-result',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = SubmitChessResultSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: result.error.flatten(),
        });
      }

      const match = await prisma.match.findUnique({
        where: { id },
        include: { proofs: true },
      });
      if (!match) return reply.status(404).send({ success: false, error: 'Match not found' });
      if (match.game !== 'CHESS') return reply.status(400).send({ success: false, error: 'Not a chess match' });

      const isCreator = match.creatorId === request.userId;
      const isAccepter = match.accepterId === request.userId;

      if (!isCreator && !isAccepter) {
        return reply.status(403).send({ success: false, error: 'Not a participant' });
      }

      if (!['IN_PROGRESS', 'SUBMITTED'].includes(match.status)) {
        return reply.status(400).send({ success: false, error: 'Match is not in progress' });
      }

      const { result: myResult } = result.data;

      // Store result proof
      await prisma.proof.upsert({
        where: { matchId_userId_type: { matchId: id, userId: request.userId, type: 'CHESS_RESULT' } },
        create: { matchId: id, userId: request.userId, type: 'CHESS_RESULT', url: match.chessLink ?? '', metadata: { result: myResult } },
        update: { metadata: { result: myResult } },
      });

      // Update match to SUBMITTED
      const now = new Date();
      const disputeDeadline = new Date(now.getTime() + DISPUTE_WINDOW_MINUTES * 60 * 1000);

      await prisma.match.update({
        where: { id },
        data: {
          status: 'SUBMITTED',
          submittedAt: now,
          disputeDeadline,
        },
      });

      // Check if opponent also submitted
      const opponentId = isCreator ? match.accepterId! : match.creatorId;
      const opponentProof = match.proofs.find(
        (p) => p.userId === opponentId && p.type === 'CHESS_RESULT'
      );

      if (!opponentProof) {
        return reply.send({
          success: true,
          message: 'Result submitted. Waiting for opponent to submit their result.',
        });
      }

      // Both submitted - check agreement
      const opponentResult = (opponentProof.metadata as { result: string })?.result;
      const myClaimedWin = myResult === 'I_WON';
      const opponentClaimedWin = opponentResult === 'I_WON';

      if (myClaimedWin === opponentClaimedWin) {
        // CONFLICT: both claim to have won, or both claim to have lost
        await prisma.match.update({
          where: { id },
          data: { status: 'DISPUTED' },
        });
        return reply.send({
          success: true,
          message: 'Both players submitted conflicting results. Admin will review.',
        });
      }

      // Agreement reached
      const winnerId = myClaimedWin ? request.userId : opponentId;
      const loserId = myClaimedWin ? opponentId : request.userId;

      // Settle match: debit both locked → credit winner pending
      await settleMatch(winnerId, loserId, match.stakeCents, match.id);

      await prisma.match.update({
        where: { id },
        data: { status: 'VERIFIED' },
      });

      // Enqueue chess-verify job (to move pending → available after verification)
      await chessVerifyQueue.add(
        'chess-verify',
        {
          matchId: id,
          winnerId,
          loserId,
          stakeCents: match.stakeCents,
        },
        {
          delay: 60 * 1000, // 1 minute delay for basic verification
          jobId: `chess-verify-${id}`,
        }
      );

      return reply.send({
        success: true,
        message: `Results match. ${winnerId === request.userId ? 'You won' : 'You lost'}. Winnings pending verification.`,
        data: { winnerId, loserId },
      });
    }
  );

  // =================== NBA 2K FLOW ===================

  /**
   * POST /matches/:id/nba2k-submit
   * Winner submits result with proof screenshot
   */
  fastify.post(
    '/matches/:id/nba2k-submit',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = SubmitNba2kResultSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: result.error.flatten(),
        });
      }

      const match = await prisma.match.findUnique({ where: { id } });
      if (!match) return reply.status(404).send({ success: false, error: 'Match not found' });
      if (match.game !== 'NBA2K') return reply.status(400).send({ success: false, error: 'Not an NBA 2K match' });

      const isCreator = match.creatorId === request.userId;
      const isAccepter = match.accepterId === request.userId;

      if (!isCreator && !isAccepter) {
        return reply.status(403).send({ success: false, error: 'Not a participant' });
      }

      if (!['ACCEPTED', 'IN_PROGRESS'].includes(match.status)) {
        return reply.status(400).send({ success: false, error: 'Match is not in the correct state' });
      }

      const { result: myResult, myScore, opponentScore, proofUrl } = result.data;

      // Store proof
      await prisma.proof.upsert({
        where: { matchId_userId_type: { matchId: id, userId: request.userId, type: 'NBA2K_RESULT' } },
        create: { matchId: id, userId: request.userId, type: 'NBA2K_RESULT', url: proofUrl, metadata: { result: myResult, myScore, opponentScore } },
        update: { url: proofUrl, metadata: { result: myResult, myScore, opponentScore } },
      });

      const now = new Date();
      const disputeDeadline = new Date(now.getTime() + DISPUTE_WINDOW_MINUTES * 60 * 1000);

      await prisma.match.update({
        where: { id },
        data: {
          status: 'SUBMITTED',
          submittedAt: now,
          disputeDeadline,
        },
      });

      // Enqueue auto-confirm job (auto-confirms after 10 min if no dispute)
      const opponentId = isCreator ? match.accepterId! : match.creatorId;
      await disputeTimeoutQueue.add(
        'dispute-timeout',
        {
          matchId: id,
          winnerId: myResult === 'I_WON' ? request.userId : opponentId,
          loserId: myResult === 'I_WON' ? opponentId : request.userId,
          stakeCents: match.stakeCents,
        },
        {
          delay: DISPUTE_WINDOW_MINUTES * 60 * 1000,
          jobId: `dispute-timeout-${id}`,
        }
      );

      return reply.send({
        success: true,
        message: `Result submitted. Opponent has ${DISPUTE_WINDOW_MINUTES} minutes to dispute.`,
      });
    }
  );

  /**
   * POST /matches/:id/nba2k-confirm
   * Loser confirms the result
   */
  fastify.post(
    '/matches/:id/nba2k-confirm',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const match = await prisma.match.findUnique({
        where: { id },
        include: { proofs: true },
      });
      if (!match) return reply.status(404).send({ success: false, error: 'Match not found' });
      if (match.game !== 'NBA2K') return reply.status(400).send({ success: false, error: 'Not an NBA 2K match' });

      const isCreator = match.creatorId === request.userId;
      const isAccepter = match.accepterId === request.userId;

      if (!isCreator && !isAccepter) {
        return reply.status(403).send({ success: false, error: 'Not a participant' });
      }

      if (match.status !== 'SUBMITTED') {
        return reply.status(400).send({ success: false, error: 'No result to confirm' });
      }

      // Find the submitted result from opponent
      const opponentId = isCreator ? match.accepterId! : match.creatorId;
      const opponentProof = match.proofs.find(
        (p) => p.userId === opponentId && p.type === 'NBA2K_RESULT'
      );

      if (!opponentProof) {
        return reply.status(400).send({ success: false, error: 'Opponent has not submitted a result yet' });
      }

      const opponentResult = (opponentProof.metadata as { result: string })?.result;
      const winnerId = opponentResult === 'I_WON' ? opponentId : request.userId;
      const loserId = opponentResult === 'I_WON' ? request.userId : opponentId;

      // Cancel the dispute-timeout job
      const job = await disputeTimeoutQueue.getJob(`dispute-timeout:${id}`);
      if (job) await job.remove();

      // Settle match
      await settleMatch(winnerId, loserId, match.stakeCents, match.id);

      await prisma.match.update({
        where: { id },
        data: { status: 'VERIFIED' },
      });

      // Enqueue verification (moves pending → available)
      await chessVerifyQueue.add(
        'chess-verify',
        {
          matchId: id,
          winnerId,
          loserId,
          stakeCents: match.stakeCents,
        },
        {
          delay: 30 * 1000, // 30 second delay for NBA2K (faster than chess)
          jobId: `chess-verify-${id}`,
        }
      );

      return reply.send({
        success: true,
        message: `Result confirmed. ${winnerId === request.userId ? 'You won' : 'Opponent won'}.`,
      });
    }
  );

  /**
   * POST /matches/:id/nba2k-dispute
   * Loser disputes the result (requires dispute bond)
   */
  fastify.post(
    '/matches/:id/nba2k-dispute',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { OpenDisputeSchema } = await import('@ignite/shared');
      const result = OpenDisputeSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: result.error.flatten(),
        });
      }

      const match = await prisma.match.findUnique({
        where: { id },
        include: { dispute: true },
      });
      if (!match) return reply.status(404).send({ success: false, error: 'Match not found' });

      if (match.creatorId !== request.userId && match.accepterId !== request.userId) {
        return reply.status(403).send({ success: false, error: 'Not a participant' });
      }

      if (match.status !== 'SUBMITTED') {
        return reply.status(400).send({ success: false, error: 'Match is not in a disputable state' });
      }

      if (match.dispute) {
        return reply.status(400).send({ success: false, error: 'Dispute already exists' });
      }

      // Check dispute window
      if (match.disputeDeadline && new Date() > match.disputeDeadline) {
        return reply.status(400).send({ success: false, error: 'Dispute window has closed' });
      }

      const pot = calcPot(match.stakeCents);
      const bondCents = calcDisputeBond(pot);

      // Check bond funds
      const balances = await getAllBalances(request.userId);
      if (balances.available < bondCents) {
        return reply.status(400).send({
          success: false,
          error: `Insufficient funds for dispute bond. Required: $${(bondCents / 100).toFixed(2)}, Available: $${(balances.available / 100).toFixed(2)}`,
        });
      }

      // Lock dispute bond
      await lockDisputeBond(
        request.userId,
        bondCents,
        match.id,
        `dispute-bond:${id}:${request.userId}`
      );

      // Create dispute
      const dispute = await prisma.dispute.create({
        data: {
          matchId: id,
          openedById: request.userId,
          bondCents,
          bondLocked: true,
          reason: result.data.reason,
        },
      });

      // Cancel auto-confirm job
      const job = await disputeTimeoutQueue.getJob(`dispute-timeout:${id}`);
      if (job) await job.remove();

      await prisma.match.update({
        where: { id },
        data: { status: 'DISPUTED' },
      });

      return reply.status(201).send({
        success: true,
        data: { disputeId: dispute.id, bondCents },
        message: 'Dispute opened. Admin will review within 24 hours.',
      });
    }
  );

  /**
   * GET /matches/templates
   * Get available match templates
   */
  fastify.get(
    '/matches/templates',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const templates = await prisma.matchTemplate.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      });

      return reply.send({ success: true, data: templates });
    }
  );
};

export default matchRoutes;
