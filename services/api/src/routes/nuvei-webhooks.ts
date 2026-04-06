import { FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { NuveiAdapter, NuveiTestAdapter } from '@ignite/payments';
import { topUp } from '@ignite/ledger';

const prisma = new PrismaClient();

const nuveiWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  const useNuvei = process.env.NUVEI_MERCHANT_ID && process.env.NUVEI_SECRET_KEY;
  const paymentAdapter = useNuvei
    ? new NuveiAdapter()
    : new NuveiTestAdapter();

  /**
   * POST /webhooks/nuvei
   * Handle Nuvei payment webhooks
   */
  fastify.post('/webhooks/nuvei', async (request, reply) => {
    const payload = request.body as any;
    const signature = request.headers['x-nuvei-signature'] as string;

    // Verify webhook signature
    if (useNuvei && !paymentAdapter.verifyWebhookSignature(payload, signature)) {
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    console.log('[Nuvei Webhook]', payload);

    try {
      const result = await paymentAdapter.processWebhook(payload);
      
      if (result.success) {
        return reply.send({ received: true });
      } else {
        return reply.status(400).send({ error: 'Processing failed' });
      }
    } catch (err: any) {
      console.error('[Nuvei Webhook Error]', err);
      return reply.status(500).send({ error: err.message });
    }
  });
};

export default nuveiWebhookRoutes;
