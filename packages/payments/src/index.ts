export interface PaymentAdapter {
  createTopUpIntent(userId: string, amountCents: number): Promise<{ clientSecret: string; intentId: string }>;
  constructWebhookEvent(payload: Buffer | string, signature: string): Promise<WebhookEvent>;
  createPayout(userId: string, amountCents: number, metadata: Record<string, string>): Promise<{ id: string }>;
}

export interface WebhookEvent {
  type: string;
  intentId?: string;
  amountCents?: number;
  userId?: string;
}

export { StripeTestAdapter } from './stripe-test';
