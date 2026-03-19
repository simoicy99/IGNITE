import Stripe from 'stripe';
import { PaymentAdapter, WebhookEvent } from './index';

export class StripeTestAdapter implements PaymentAdapter {
  private stripe: Stripe;
  private webhookSecret: string;

  constructor(secretKey: string, webhookSecret: string) {
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2024-04-10',
    });
    this.webhookSecret = webhookSecret;
  }

  async createTopUpIntent(
    userId: string,
    amountCents: number
  ): Promise<{ clientSecret: string; intentId: string }> {
    const intent = await this.stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      metadata: {
        userId,
        platform: 'ignite',
        type: 'top_up',
      },
      // Enable test mode payment methods
      payment_method_types: ['card'],
      description: `Ignite wallet top-up for user ${userId}`,
    });

    if (!intent.client_secret) {
      throw new Error('Stripe did not return a client secret');
    }

    return {
      clientSecret: intent.client_secret,
      intentId: intent.id,
    };
  }

  async constructWebhookEvent(
    payload: Buffer | string,
    signature: string
  ): Promise<WebhookEvent> {
    const event = this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret
    );

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object as Stripe.PaymentIntent;
      return {
        type: 'payment_intent.succeeded',
        intentId: intent.id,
        amountCents: intent.amount,
        userId: intent.metadata?.userId,
      };
    }

    if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object as Stripe.PaymentIntent;
      return {
        type: 'payment_intent.payment_failed',
        intentId: intent.id,
        amountCents: intent.amount,
        userId: intent.metadata?.userId,
      };
    }

    return {
      type: event.type,
    };
  }

  async createPayout(
    userId: string,
    amountCents: number,
    metadata: Record<string, string>
  ): Promise<{ id: string }> {
    // In test mode, we create a transfer to a connected account
    // For MVP, we create a payout record and handle manually
    // Real implementation would use Stripe Connect or Stripe Payouts
    const transfer = await this.stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      metadata: {
        userId,
        type: 'withdrawal',
        ...metadata,
      },
      // This is a placeholder - real payouts need Stripe Connect
      payment_method_types: ['card'],
      description: `Ignite withdrawal for user ${userId}`,
      capture_method: 'manual', // Don't actually charge
    });

    return { id: transfer.id };
  }
}
