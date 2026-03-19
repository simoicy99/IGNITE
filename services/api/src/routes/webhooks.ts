import { FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { StripeTestAdapter } from '@ignite/payments';
import { topUp } from '@ignite/ledger';

const prisma = new PrismaClient();

const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  const stripeAdapter = new StripeTestAdapter(
    process.env.STRIPE_SECRET_KEY!,
    process.env.STRIPE_WEBHOOK_SECRET!
  );

  /**
   * POST /webhooks/stripe
   * Handle Stripe webhook events
   * Must be raw body (no JSON parsing) for signature verification
   */
  fastify.post(
    '/webhooks/stripe',
    {
      config: {
        rawBody: true, // Need raw body for Stripe signature verification
      },
    },
    async (request, reply) => {
      const signature = request.headers['stripe-signature'] as string;

      if (!signature) {
        return reply.status(400).send({ error: 'Missing stripe-signature header' });
      }

      let event;
      try {
        const rawBody = (request as any).rawBody ?? JSON.stringify(request.body);
        event = await stripeAdapter.constructWebhookEvent(rawBody, signature);
      } catch (err: any) {
        request.log.error({ err }, 'Stripe webhook signature verification failed');
        return reply.status(400).send({ error: `Webhook signature verification failed: ${err.message}` });
      }

      request.log.info({ eventType: event.type }, 'Stripe webhook received');

      try {
        if (event.type === 'payment_intent.succeeded') {
          const { intentId, amountCents, userId } = event;

          if (!intentId || !amountCents || !userId) {
            request.log.warn({ event }, 'Stripe webhook missing required fields');
            return reply.send({ received: true });
          }

          // Find payment intent in DB
          const paymentIntent = await prisma.paymentIntent.findUnique({
            where: { providerIntentId: intentId },
          });

          if (!paymentIntent) {
            request.log.warn({ intentId }, 'Payment intent not found in DB');
            return reply.send({ received: true });
          }

          if (paymentIntent.status === 'completed') {
            // Already processed - idempotent
            return reply.send({ received: true });
          }

          // Credit user's wallet
          await topUp(userId, amountCents, intentId);

          // Mark payment intent as completed
          await prisma.paymentIntent.update({
            where: { providerIntentId: intentId },
            data: {
              status: 'completed',
              updatedAt: new Date(),
            },
          });

          request.log.info(
            { userId, amountCents, intentId },
            'Wallet topped up successfully'
          );
        } else if (event.type === 'payment_intent.payment_failed') {
          const { intentId } = event;

          if (intentId) {
            await prisma.paymentIntent.updateMany({
              where: { providerIntentId: intentId },
              data: { status: 'failed' },
            });
          }

          request.log.info({ intentId }, 'Payment intent failed');
        }
      } catch (err) {
        request.log.error({ err, event }, 'Error processing Stripe webhook');
        // Return 200 to prevent Stripe from retrying for processing errors
        // (We don't want to retry if it's our own bug)
        return reply.send({ received: true, error: 'Processing error' });
      }

      return reply.send({ received: true });
    }
  );
};

export default webhookRoutes;
