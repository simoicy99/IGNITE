import { FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { TopUpSchema, WithdrawSchema } from '@ignite/shared';
import { getAllBalances, initiateWithdrawal, getTransactions } from '@ignite/ledger';
import { StripeTestAdapter } from '@ignite/payments';

const prisma = new PrismaClient();

const walletRoutes: FastifyPluginAsync = async (fastify) => {
  const stripeAdapter = new StripeTestAdapter(
    process.env.STRIPE_SECRET_KEY!,
    process.env.STRIPE_WEBHOOK_SECRET!
  );

  /**
   * GET /wallet
   * Get current user's wallet balances
   */
  fastify.get(
    '/wallet',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const balances = await getAllBalances(request.userId);

      return reply.send({
        success: true,
        data: balances,
      });
    }
  );

  /**
   * POST /wallet/topup
   * Create a Stripe PaymentIntent for topping up the wallet.
   * Requires geo gate.
   */
  fastify.post(
    '/wallet/topup',
    { preHandler: [fastify.authenticate, fastify.geoGate] },
    async (request, reply) => {
      const result = TopUpSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: result.error.flatten(),
        });
      }

      const { amountCents } = result.data;

      // Create Stripe payment intent
      const { clientSecret, intentId } = await stripeAdapter.createTopUpIntent(
        request.userId,
        amountCents
      );

      // Record pending payment intent
      await prisma.paymentIntent.create({
        data: {
          userId: request.userId,
          providerIntentId: intentId,
          amountCents,
          status: 'pending',
          provider: 'stripe_test',
        },
      });

      return reply.status(201).send({
        success: true,
        data: {
          clientSecret,
          intentId,
          amountCents,
        },
      });
    }
  );

  /**
   * POST /wallet/withdraw
   * Initiate a withdrawal from AVAILABLE balance.
   * Requires geo gate + identity verification check.
   */
  fastify.post(
    '/wallet/withdraw',
    { preHandler: [fastify.authenticate, fastify.geoGate] },
    async (request, reply) => {
      const result = WithdrawSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: result.error.flatten(),
        });
      }

      const { amountCents, payoutMethod } = result.data;

      // Check available balance
      const balances = await getAllBalances(request.userId);
      if (balances.available < amountCents) {
        return reply.status(400).send({
          success: false,
          error: `Insufficient funds. Available: $${(balances.available / 100).toFixed(2)}, Requested: $${(amountCents / 100).toFixed(2)}`,
        });
      }

      // Create withdrawal record
      const withdrawal = await prisma.withdrawal.create({
        data: {
          userId: request.userId,
          amountCents,
          status: 'PENDING',
        },
      });

      // Debit from available (funds held until admin approves)
      await initiateWithdrawal(request.userId, amountCents, withdrawal.id);

      return reply.status(201).send({
        success: true,
        data: {
          withdrawalId: withdrawal.id,
          amountCents,
          status: 'PENDING',
          message: 'Withdrawal request submitted. Funds will be processed within 1-3 business days.',
        },
      });
    }
  );

  /**
   * GET /wallet/transactions
   * Get transaction history
   */
  fastify.get(
    '/wallet/transactions',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const query = request.query as { cursor?: string; limit?: string };
      const limit = Math.min(parseInt(query.limit ?? '20'), 100);

      const { entries, nextCursor } = await getTransactions(
        request.userId,
        limit,
        query.cursor
      );

      return reply.send({
        success: true,
        data: {
          items: entries.map(({ entry, accountType }) => ({
            id: entry.id,
            accountType,
            amountCents: entry.amountCents,
            direction: entry.direction,
            eventType: entry.eventType,
            matchId: entry.matchId,
            withdrawalId: entry.withdrawalId,
            createdAt: entry.createdAt,
          })),
          nextCursor,
        },
      });
    }
  );

  /**
   * GET /wallet/withdrawals
   * Get withdrawal history
   */
  fastify.get(
    '/wallet/withdrawals',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const withdrawals = await prisma.withdrawal.findMany({
        where: { userId: request.userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      return reply.send({
        success: true,
        data: withdrawals,
      });
    }
  );
};

export default walletRoutes;
