import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const NUVEI_MERCHANT_ID = process.env.NUVEI_MERCHANT_ID;
const NUVEI_MERCHANT_SITE_ID = process.env.NUVEI_MERCHANT_SITE_ID;
const NUVEI_SECRET_KEY = process.env.NUVEI_SECRET_KEY;
const NUVEI_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://secure.nuvei.com/ppp/api/v1'
  : 'https://ppp-test.nuvei.com/ppp/api/v1';

export class NuveiAdapter {
  private merchantId: string;
  private merchantSiteId: string;
  private secretKey: string;

  constructor() {
    if (!NUVEI_MERCHANT_ID || !NUVEI_MERCHANT_SITE_ID || !NUVEI_SECRET_KEY) {
      throw new Error('Nuvei credentials not configured');
    }
    this.merchantId = NUVEI_MERCHANT_ID;
    this.merchantSiteId = NUVEI_MERCHANT_SITE_ID;
    this.secretKey = NUVEI_SECRET_KEY;
  }

  private generateSignature(params: Record<string, any>): string {
    // Nuvei uses SHA256 signature
    const crypto = require('crypto');
    const sortedKeys = Object.keys(params).sort();
    const signatureString = sortedKeys.map(k => params[k]).join('') + this.secretKey;
    return crypto.createHash('sha256').update(signatureString).digest('hex');
  }

  private async makeRequest(endpoint: string, params: Record<string, any>) {
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const body = {
      ...params,
      merchantId: this.merchantId,
      merchantSiteId: this.merchantSiteId,
      timeStamp: timestamp,
    };

    // Add checksum
    body.checksum = this.generateSignature(body);

    const res = await fetch(`${NUVEI_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Nuvei API error: ${err}`);
    }

    return res.json();
  }

  /**
   * Create a card payment session (for deposits/top-ups)
   */
  async createCardPaymentSession(
    userId: string,
    amountCents: number,
    currency: string = 'USD'
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const orderId = `ignite-${userId}-${Date.now()}`;

    const result = await this.makeRequest('/payment', {
      sessionType: 'payment',
      amount: (amountCents / 100).toFixed(2),
      currency,
      orderId,
      userTokenId: userId,
      billingAddress: {
        email: user.email,
        country: 'US', // Simplified - should come from user profile
      },
      merchantDetails: {
        customField1: userId,
        customField2: 'wallet-topup',
      },
      // URL to redirect after payment
      successUrl: `${process.env.FRONTEND_URL}/wallet/success`,
      failureUrl: `${process.env.FRONTEND_URL}/wallet/failed`,
    });

    return {
      sessionToken: result.sessionToken,
      orderId,
      redirectUrl: result.redirectUrl,
    };
  }

  /**
   * Create a bank transfer (ACH) session
   */
  async createBankTransferSession(
    userId: string,
    amountCents: number,
    currency: string = 'USD'
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const orderId = `ignite-bank-${userId}-${Date.now()}`;

    const result = await this.makeRequest('/payment', {
      sessionType: 'payment',
      amount: (amountCents / 100).toFixed(2),
      currency,
      orderId,
      userTokenId: userId,
      paymentOption: {
        alternativePaymentMethod: {
          paymentMethod: 'apmglobal_ach', // ACH bank transfer
        },
      },
      billingAddress: {
        email: user.email,
        country: 'US',
      },
      merchantDetails: {
        customField1: userId,
        customField2: 'wallet-topup-bank',
      },
    });

    return {
      sessionToken: result.sessionToken,
      orderId,
      redirectUrl: result.redirectUrl,
    };
  }

  /**
   * Create a withdrawal (payout) to bank account
   */
  async createWithdrawal(
    userId: string,
    amountCents: number,
    bankAccountDetails: {
      accountNumber: string;
      routingNumber: string;
      accountType: 'checking' | 'savings';
      holderName: string;
    }
  ) {
    const orderId = `ignite-withdrawal-${userId}-${Date.now()}`;

    const result = await this.makeRequest('/payout', {
      amount: (amountCents / 100).toFixed(2),
      currency: 'USD',
      orderId,
      userTokenId: userId,
      payoutMethod: 'apmglobal_ach',
      bankAccount: {
        accountNumber: bankAccountDetails.accountNumber,
        routingNumber: bankAccountDetails.routingNumber,
        accountType: bankAccountDetails.accountType,
        holderName: bankAccountDetails.holderName,
      },
      merchantDetails: {
        customField1: userId,
        customField2: 'wallet-withdrawal',
      },
    });

    return {
      payoutId: result.payoutId,
      orderId,
      status: result.status,
    };
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: any, signature: string): boolean {
    const expectedSignature = this.generateSignature(payload);
    return signature === expectedSignature;
  }

  /**
   * Process webhook (for payment status updates)
   */
  async processWebhook(payload: any) {
    const { orderId, status, userTokenId, amount } = payload;

    if (status === 'approved') {
      // Find the payment intent
      const paymentIntent = await prisma.paymentIntent.findFirst({
        where: { providerIntentId: orderId },
      });

      if (paymentIntent && paymentIntent.status === 'pending') {
        // Update payment intent
        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: { status: 'succeeded' },
        });

        // Credit user's wallet
        const { topUp } = await import('@ignite/ledger');
        await topUp(paymentIntent.userId, paymentIntent.amountCents, orderId);

        return { success: true, credited: paymentIntent.amountCents };
      }
    }

    return { success: false };
  }
}

// Simple test adapter for development
export class NuveiTestAdapter {
  async createCardPaymentSession(userId: string, amountCents: number) {
    console.log(`[Nuvei Test] Card payment session for ${userId}: $${amountCents / 100}`);
    return {
      sessionToken: 'test-session-token',
      orderId: `test-order-${Date.now()}`,
      redirectUrl: `${process.env.FRONTEND_URL}/wallet/test-payment?amount=${amountCents}`,
    };
  }

  async createBankTransferSession(userId: string, amountCents: number) {
    console.log(`[Nuvei Test] Bank transfer session for ${userId}: $${amountCents / 100}`);
    return {
      sessionToken: 'test-bank-session',
      orderId: `test-bank-order-${Date.now()}`,
      redirectUrl: `${process.env.FRONTEND_URL}/wallet/test-bank?amount=${amountCents}`,
    };
  }

  async createWithdrawal(userId: string, amountCents: number, bankDetails: any) {
    console.log(`[Nuvei Test] Withdrawal for ${userId}: $${amountCents / 100}`);
    return {
      payoutId: `test-payout-${Date.now()}`,
      orderId: `test-withdrawal-${Date.now()}`,
      status: 'pending',
    };
  }

  verifyWebhookSignature(): boolean {
    return true;
  }

  async processWebhook(payload: any) {
    console.log(`[Nuvei Test] Webhook:`, payload);
    return { success: true };
  }
}
