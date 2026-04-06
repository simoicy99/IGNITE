import { FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { ResolveDisputeSchema, AddAllowlistEmailSchema } from '@ignite/shared';
import { settleDispute, pendingToAvailable, unlockFunds, releaseDisputeBond, settleMatch } from '@ignite/ledger';
import { calcWinnerPayout } from '@ignite/shared';

const prisma = new PrismaClient();

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // All admin routes require admin authentication
  fastify.addHook('preHandler', fastify.authenticateAdmin);

  /**
   * GET /disputes
   * List all disputes (open first)
   */
  fastify.get('/disputes', async (request, reply) => {
    const query = request.query as { status?: string; cursor?: string; limit?: string };
    const limit = Math.min(parseInt(query.limit ?? '20'), 100);

    const disputes = await prisma.dispute.findMany({
      where: query.status ? { status: query.status as any } : undefined,
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      orderBy: [
        { status: 'asc' }, // OPEN first
        { createdAt: 'desc' },
      ],
      include: {
        match: {
          include: {
            creator: { select: { id: true, handle: true } },
            accepter: { select: { id: true, handle: true } },
            template: true,
            proofs: true,
          },
        },
      },
    });

    const hasMore = disputes.length > limit;
    const items = disputes.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return reply.send({
      success: true,
      data: { items, nextCursor },
    });
  });

  /**
   * GET /admin/disputes/:id
   * Get dispute details
   */
  fastify.get('/disputes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const dispute = await prisma.dispute.findUnique({
      where: { id },
      include: {
        match: {
          include: {
            creator: { select: { id: true, handle: true, email: true } },
            accepter: { select: { id: true, handle: true, email: true } },
            template: true,
            proofs: true,
          },
        },
      },
    });

    if (!dispute) {
      return reply.status(404).send({ success: false, error: 'Dispute not found' });
    }

    return reply.send({ success: true, data: dispute });
  });

  /**
   * POST /admin/disputes/:id/resolve
   * Resolve a dispute (admin only)
   * decision: "UPHELD" | "DENIED"
   *
   * UPHELD = disputer was right (original result was wrong)
   *   - For NBA2K: original submitter was wrong, disputer gets bond back, result reversed
   *   - Bond goes back to disputer
   *
   * DENIED = disputer was wrong (original result stands)
   *   - Bond forfeited to opponent
   *   - Original result stands
   */
  fastify.post('/disputes/:id/resolve', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = ResolveDisputeSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: 'Validation error',
        details: result.error.flatten(),
      });
    }

    const { decision, reason } = result.data;

    const dispute = await prisma.dispute.findUnique({
      where: { id },
      include: {
        match: {
          include: { proofs: true },
        },
      },
    });

    if (!dispute) {
      return reply.status(404).send({ success: false, error: 'Dispute not found' });
    }

    if (dispute.status !== 'OPEN') {
      return reply.status(400).send({ success: false, error: 'Dispute is already resolved' });
    }

    const match = dispute.match;

    if (decision === 'DENIED') {
      // Dispute denied: original result stands
      // 1. Forfeit disputer's bond to opponent
      // 2. Complete settlement (settle match in favor of original winner)

      // Find original winner from proofs
      const originalSubmission = match.proofs.find(
        (p) => p.type === 'NBA2K_RESULT' || p.type === 'CHESS_RESULT'
      );

      // Determine original winner (whoever said I_WON in original submission)
      const creatorProof = match.proofs.find(
        (p) => p.userId === match.creatorId && (p.type === 'NBA2K_RESULT' || p.type === 'CHESS_RESULT')
      );
      const accepterProof = match.proofs.find(
        (p) => p.userId === match.accepterId && (p.type === 'NBA2K_RESULT' || p.type === 'CHESS_RESULT')
      );

      let originalWinnerId: string;
      let originalLoserId: string;

      if (creatorProof && (creatorProof.metadata as any)?.result === 'I_WON') {
        originalWinnerId = match.creatorId;
        originalLoserId = match.accepterId!;
      } else if (accepterProof && (accepterProof.metadata as any)?.result === 'I_WON') {
        originalWinnerId = match.accepterId!;
        originalLoserId = match.creatorId;
      } else {
        // Fallback - non-disputer wins
        originalWinnerId = dispute.openedById === match.creatorId ? match.accepterId! : match.creatorId;
        originalLoserId = dispute.openedById;
      }

      const opponentId = dispute.openedById === match.creatorId ? match.accepterId! : match.creatorId;

      // Settle dispute (forfeit bond)
      await settleDispute(
        match.id,
        dispute.openedById,
        opponentId,
        dispute.bondCents,
        'DENIED',
        originalWinnerId
      );

      // Settle the match (if not already settled)
      if (match.status !== 'SETTLED') {
        await settleMatch(originalWinnerId, originalLoserId, match.stakeCents, match.id);
      }

      // Move winner's pending to available
      const winnerPayout = calcWinnerPayout(match.stakeCents);
      await pendingToAvailable(
        originalWinnerId,
        winnerPayout,
        match.id,
        `verify:${match.id}:admin-denied`
      );

    } else {
      // UPHELD: dispute was valid
      // Determine who the "correct" winner is (disputer's claim wins)
      // For simplicity: the disputer claims they won / opponent lied

      const disputerProof = match.proofs.find(
        (p) => p.userId === dispute.openedById && (p.type === 'NBA2K_RESULT' || p.type === 'CHESS_RESULT')
      );

      let upheldWinnerId: string;
      let upheldLoserId: string;

      if (disputerProof && (disputerProof.metadata as any)?.result === 'I_WON') {
        // Disputer claims they won - admin upheld this
        upheldWinnerId = dispute.openedById;
        upheldLoserId = dispute.openedById === match.creatorId ? match.accepterId! : match.creatorId;
      } else {
        // Disputer claimed they lost (opponent cheated) - but the match result still stands
        // In this case UPHELD means: original result was wrong, we're reversing
        upheldWinnerId = dispute.openedById === match.creatorId ? match.accepterId! : match.creatorId;
        upheldLoserId = dispute.openedById;
      }

      const opponentId = dispute.openedById === match.creatorId ? match.accepterId! : match.creatorId;

      // Return bond to disputer
      await settleDispute(
        match.id,
        dispute.openedById,
        opponentId,
        dispute.bondCents,
        'UPHELD',
        upheldWinnerId
      );

      // If match wasn't settled with correct winner, settle now
      if (match.status !== 'SETTLED') {
        await settleMatch(upheldWinnerId, upheldLoserId, match.stakeCents, match.id);
      }

      // Move winner's pending to available
      const winnerPayout = calcWinnerPayout(match.stakeCents);
      await pendingToAvailable(
        upheldWinnerId,
        winnerPayout,
        match.id,
        `verify:${match.id}:admin-upheld`
      );
    }

    // Update dispute and match status
    await prisma.$transaction([
      prisma.dispute.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          decision,
          decidedById: request.userId,
          reason,
          resolvedAt: new Date(),
          bondLocked: false,
        },
      }),
      prisma.match.update({
        where: { id: match.id },
        data: { status: 'RESOLVED' },
      }),
    ]);

    return reply.send({
      success: true,
      message: `Dispute resolved: ${decision}`,
      data: { decision, reason },
    });
  });

  /**
   * GET /withdrawals
   * List pending withdrawals
   */
  fastify.get('/withdrawals', async (request, reply) => {
    const query = request.query as { status?: string };

    const withdrawals = await prisma.withdrawal.findMany({
      where: { status: (query.status as any) ?? 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, handle: true, email: true } },
      },
    });

    return reply.send({ success: true, data: withdrawals });
  });

  /**
   * POST /admin/withdrawals/:id/approve
   * Approve a withdrawal
   */
  fastify.post('/withdrawals/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };

    const withdrawal = await prisma.withdrawal.findUnique({ where: { id } });
    if (!withdrawal) {
      return reply.status(404).send({ success: false, error: 'Withdrawal not found' });
    }

    if (withdrawal.status !== 'PENDING') {
      return reply.status(400).send({ success: false, error: 'Withdrawal is not pending' });
    }

    await prisma.withdrawal.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: request.userId,
      },
    });

    return reply.send({ success: true, message: 'Withdrawal approved' });
  });

  /**
   * POST /admin/withdrawals/:id/reject
   * Reject a withdrawal and return funds
   */
  fastify.post('/withdrawals/:id/reject', async (request, reply) => {
    const { id } = request.params as { id: string };

    const withdrawal = await prisma.withdrawal.findUnique({ where: { id } });
    if (!withdrawal) {
      return reply.status(404).send({ success: false, error: 'Withdrawal not found' });
    }

    if (withdrawal.status !== 'PENDING') {
      return reply.status(400).send({ success: false, error: 'Withdrawal is not pending' });
    }

    // Return funds to AVAILABLE
    const { getOrCreateAccount, credit } = await import('@ignite/ledger');
    // Note: We use a workaround since getOrCreateAccount is not exported
    // We'll just do a direct credit
    const { prisma: ledgerPrisma } = await import('@ignite/ledger');
    const availableAccount = await ledgerPrisma.walletAccount.findUnique({
      where: { userId_type: { userId: withdrawal.userId, type: 'AVAILABLE' } },
    });

    if (availableAccount) {
      await ledgerPrisma.ledgerEntry.upsert({
        where: { idempotencyKey: `withdrawal:${id}:reject:refund` },
        create: {
          accountId: availableAccount.id,
          amountCents: withdrawal.amountCents,
          direction: 'CREDIT',
          eventType: 'WITHDRAWAL_REJECTED',
          idempotencyKey: `withdrawal:${id}:reject:refund`,
          withdrawalId: id,
        },
        update: {},
      });
    }

    await prisma.withdrawal.update({
      where: { id },
      data: { status: 'REJECTED' },
    });

    return reply.send({ success: true, message: 'Withdrawal rejected and funds returned' });
  });

  /**
   * GET /admin/users
   * List users
   */
  fastify.get('/users', async (request, reply) => {
    const query = request.query as { cursor?: string; limit?: string; search?: string };
    const limit = Math.min(parseInt(query.limit ?? '20'), 100);

    const users = await prisma.user.findMany({
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      where: query.search
        ? {
            OR: [
              { handle: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        handle: true,
        isAdmin: true,
        lastGeoState: true,
        createdAt: true,
        _count: {
          select: {
            matchesCreated: true,
            matchesAccepted: true,
          },
        },
      },
    });

    const hasMore = users.length > limit;
    const items = users.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return reply.send({ success: true, data: { items, nextCursor } });
  });

  /**
   * POST /admin/allowlist
   * Add email to allowlist
   */
  fastify.post('/allowlist', async (request, reply) => {
    const result = AddAllowlistEmailSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: 'Validation error',
        details: result.error.flatten(),
      });
    }

    const { email, note } = result.data;

    const entry = await prisma.allowlistEmail.upsert({
      where: { email: email.toLowerCase() },
      update: { note },
      create: {
        email: email.toLowerCase(),
        invitedBy: request.userId,
        note,
      },
    });

    return reply.status(201).send({ success: true, data: entry });
  });

  /**
   * GET /stats
   * Platform-wide statistics
   */
  fastify.get('/stats', async (request, reply) => {
    const [
      totalUsers,
      totalMatches,
      activeMatches,
      openDisputes,
      pendingWithdrawals,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.match.count(),
      prisma.match.count({
        where: { status: { in: ['FUNDED', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED'] } },
      }),
      prisma.dispute.count({ where: { status: 'OPEN' } }),
      prisma.withdrawal.count({ where: { status: 'PENDING' } }),
    ]);

    return reply.send({
      success: true,
      data: {
        totalUsers,
        totalMatches,
        activeMatches,
        openDisputes,
        pendingWithdrawals,
      },
    });
  });

  /**
   * GET /matches
   * List all matches with filtering
   */
  fastify.get('/matches', async (request, reply) => {
    const query = request.query as { status?: string; cursor?: string; limit?: string };
    const limit = Math.min(parseInt(query.limit ?? '20'), 100);

    const matches = await prisma.match.findMany({
      where: query.status ? { status: query.status as any } : undefined,
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { id: true, handle: true, email: true } },
        accepter: { select: { id: true, handle: true, email: true } },
        template: true,
        dispute: true,
      },
    });

    const hasMore = matches.length > limit;
    const items = matches.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return reply.send({
      success: true,
      data: { items, nextCursor },
    });
  });

  /**
   * GET /admin/matches/:id
   * Get match details with proofs
   */
  fastify.get('/matches/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const match = await prisma.match.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, handle: true, email: true } },
        accepter: { select: { id: true, handle: true, email: true } },
        template: true,
        proofs: true,
        dispute: true,
      },
    });

    if (!match) {
      return reply.status(404).send({ success: false, error: 'Match not found' });
    }

    return reply.send({ success: true, data: match });
  });

  /**
   * POST /admin/matches/:id/cancel
   * Cancel a match and refund both players
   */
  fastify.post('/matches/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };

    const match = await prisma.match.findUnique({
      where: { id },
      include: { creator: true, accepter: true },
    });

    if (!match) {
      return reply.status(404).send({ success: false, error: 'Match not found' });
    }

    if (!['CREATED', 'ACCEPTED', 'FUNDED'].includes(match.status)) {
      return reply.status(400).send({
        success: false,
        error: `Cannot cancel match in status: ${match.status}`,
      });
    }

    // Unlock funds for both players
    if (match.status === 'FUNDED' && match.accepterId) {
      await Promise.all([
        unlockFunds(match.creatorId, match.stakeCents, match.id, `admin-cancel:${match.id}:creator`),
        unlockFunds(match.accepterId, match.stakeCents, match.id, `admin-cancel:${match.id}:accepter`),
      ]);
    }

    await prisma.match.update({
      where: { id },
      data: { status: 'CANCELED' },
    });

    return reply.send({
      success: true,
      message: 'Match canceled and funds refunded',
    });
  });

  /**
   * POST /admin/matches/:id/settle
   * Force settle a match (admin override)
   */
  fastify.post('/matches/:id/settle', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { winnerId } = request.body as { winnerId: string };

    const match = await prisma.match.findUnique({
      where: { id },
      include: { creator: true, accepter: true },
    });

    if (!match) {
      return reply.status(404).send({ success: false, error: 'Match not found' });
    }

    if (!['SUBMITTED', 'DISPUTED', 'IN_PROGRESS'].includes(match.status)) {
      return reply.status(400).send({
        success: false,
        error: `Cannot settle match in status: ${match.status}`,
      });
    }

    if (winnerId !== match.creatorId && winnerId !== match.accepterId) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid winner ID',
      });
    }

    const loserId = winnerId === match.creatorId ? match.accepterId! : match.creatorId;

    // Settle the match
    await settleMatch(winnerId, loserId, match.stakeCents, match.id);

    // Move to VERIFIED then SETTLED
    await prisma.match.update({
      where: { id },
      data: {
        status: 'SETTLED',
        metadata: {
          ...(match.metadata as object || {}),
          adminSettled: true,
          settledBy: request.userId,
          settledAt: new Date().toISOString(),
        },
      },
    });

    // For non-chess, move pending to available immediately
    if (match.game !== 'CHESS') {
      const winnerPayout = calcWinnerPayout(match.stakeCents);
      await pendingToAvailable(
        winnerId,
        winnerPayout,
        match.id,
        `admin-settle:${match.id}:payout`
      );
    }

    return reply.send({
      success: true,
      message: 'Match settled by admin',
      data: { winnerId, loserId },
    });
  });
};

export default adminRoutes;
