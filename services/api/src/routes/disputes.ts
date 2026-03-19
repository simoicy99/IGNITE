import { FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { OpenDisputeSchema, calcDisputeBond, calcPot } from '@ignite/shared';
import { lockDisputeBond, getAllBalances } from '@ignite/ledger';

const prisma = new PrismaClient();

const disputeRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /disputes
   * List user's disputes
   */
  fastify.get(
    '/disputes',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const disputes = await prisma.dispute.findMany({
        where: {
          match: {
            OR: [
              { creatorId: request.userId },
              { accepterId: request.userId },
            ],
          },
        },
        include: {
          match: {
            include: {
              creator: { select: { id: true, handle: true } },
              accepter: { select: { id: true, handle: true } },
              proofs: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({ success: true, data: disputes });
    }
  );

  /**
   * GET /disputes/:id
   * Get dispute details
   */
  fastify.get(
    '/disputes/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const dispute = await prisma.dispute.findUnique({
        where: { id },
        include: {
          match: {
            include: {
              creator: { select: { id: true, handle: true } },
              accepter: { select: { id: true, handle: true } },
              proofs: true,
              template: true,
            },
          },
        },
      });

      if (!dispute) {
        return reply.status(404).send({ success: false, error: 'Dispute not found' });
      }

      // Check access
      const match = dispute.match;
      if (match.creatorId !== request.userId && match.accepterId !== request.userId && !request.isAdmin) {
        return reply.status(403).send({ success: false, error: 'Access denied' });
      }

      return reply.send({ success: true, data: dispute });
    }
  );

  /**
   * POST /disputes/match/:matchId
   * Open a dispute for a match (generic endpoint used for chess)
   */
  fastify.post(
    '/disputes/match/:matchId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { matchId } = request.params as { matchId: string };
      const result = OpenDisputeSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: result.error.flatten(),
        });
      }

      const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: { dispute: true },
      });

      if (!match) {
        return reply.status(404).send({ success: false, error: 'Match not found' });
      }

      if (match.creatorId !== request.userId && match.accepterId !== request.userId) {
        return reply.status(403).send({ success: false, error: 'Not a participant' });
      }

      if (!['SUBMITTED', 'DISPUTED'].includes(match.status)) {
        return reply.status(400).send({ success: false, error: 'Match is not in a disputable state' });
      }

      if (match.dispute) {
        return reply.status(400).send({ success: false, error: 'Dispute already exists for this match' });
      }

      // Check dispute window
      if (match.disputeDeadline && new Date() > match.disputeDeadline) {
        return reply.status(400).send({ success: false, error: 'Dispute window has closed' });
      }

      const pot = calcPot(match.stakeCents);
      const bondCents = calcDisputeBond(pot);

      // Check balance
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
        matchId,
        `dispute-bond:${matchId}:${request.userId}`
      );

      // Create dispute
      const dispute = await prisma.dispute.create({
        data: {
          matchId,
          openedById: request.userId,
          bondCents,
          bondLocked: true,
          reason: result.data.reason,
        },
      });

      await prisma.match.update({
        where: { id: matchId },
        data: { status: 'DISPUTED' },
      });

      return reply.status(201).send({
        success: true,
        data: { disputeId: dispute.id, bondCents },
        message: 'Dispute opened. Admin will review within 24 hours.',
      });
    }
  );
};

export default disputeRoutes;
