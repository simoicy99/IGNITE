import { FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { TopUpSchema, WithdrawSchema } from '@ignite/shared';
import { getAllBalances, initiateWithdrawal, getTransactions } from '@ignite/ledger';
import { StripeTestAdapter, NuveiAdapter, NuveiTestAdapter } from '@ignite/payments';

const prisma = new PrismaClient();

const walletRoutes: FastifyPluginAsync = async (fastify) => {
  // Use Nuvei if configured, otherwise fallback to Stripe test
  const useNuvei = process.env.NUVEI_MERCHANT_ID && process.env.NUVEI_SECRET_KEY;
  const paymentAdapter = useNuvei
    ? new NuveiAdapter()
    : process.env.NODE_ENV === 'production'
    ? new StripeTestAdapter(process.env.STRIPE_SECRET_KEY!, process.env.STRIPE_WEBHOOK_SECRET!)
    : new NuveiTestAdapter();

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

  /**
   * POST /wallet/topup/card (Nuvei)
   * Create a card payment session
   */
  fastify.post(
    '/wallet/topup/card',
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

      try {
        const session = await (paymentAdapter as any).createCardPaymentSession(
          request.userId,
          amountCents
        );

        // Record pending payment
        await prisma.paymentIntent.create({
          data: {
            userId: request.userId,
            providerIntentId: session.orderId,
            amountCents,
            status: 'pending',
            provider: 'nuvei',
          },
        });

        return reply.send({
          success: true,
          data: {
            sessionToken: session.sessionToken,
            orderId: session.orderId,
            redirectUrl: session.redirectUrl,
          },
        });
      } catch (err: any) {
        return reply.status(500).send({
          success: false,
          error: err.message,
        });
      }
    }
  );

  /**
   * POST /wallet/topup/bank (Nuvei)
   * Create a bank transfer (ACH) session
   */
  fastify.post(
    '/wallet/topup/bank',
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

      try {
        const session = await (paymentAdapter as any).createBankTransferSession(
          request.userId,
          amountCents
        );

        // Record pending payment
        await prisma.paymentIntent.create({
          data: {
            userId: request.userId,
            providerIntentId: session.orderId,
            amountCents,
            status: 'pending',
            provider: 'nuvei_bank',
          },
        });

        return reply.send({
          success: true,
          data: {
            sessionToken: session.sessionToken,
            orderId: session.orderId,
            redirectUrl: session.redirectUrl,
          },
        });
      } catch (err: any) {
        return reply.status(500).send({
          success: false,
          error: err.message,
        });
      }
    }
  );

  /**
   * POST /wallet/withdraw/bank (Nuvei)
   * Withdraw to bank account via ACH
   */
  fastify.post(
    '/wallet/withdraw/bank',
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

      const { amountCents } = result.data;

      // Check balance
      const balances = await getAllBalances(request.userId);
      if (balances.available < amountCents) {
        return reply.status(400).send({
          success: false,
          error: 'Insufficient funds',
        });
      }

      // Get bank details from request
      const { bankAccount } = request.body as any;
      if (!bankAccount?.accountNumber || !bankAccount?.routingNumber) {
        return reply.status(400).send({
          success: false,
          error: 'Bank account details required',
        });
      }

      try {
        // Create withdrawal in Nuvei
        const withdrawal = await (paymentAdapter as any).createWithdrawal(
          request.userId,
          amountCents,
          bankAccount
        );

        // Debit user's wallet
        await initiateWithdrawal(request.userId, amountCents, withdrawal.payoutId);

        // Record withdrawal
        await prisma.withdrawal.create({
          data: {
            userId: request.userId,
            amountCents,
            status: 'PENDING',
            provider: 'nuvei',
            providerWithdrawalId: withdrawal.payoutId,
          },
        });

        return reply.send({
          success: true,
          data: {
            payoutId: withdrawal.payoutId,
            status: withdrawal.status,
          },
        });
      } catch (err: any) {
        return reply.status(500).send({
          success: false,
          error: err.message,
        });
      }
    }
  );
};

export default walletRoutes;
