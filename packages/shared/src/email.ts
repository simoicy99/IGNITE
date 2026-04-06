import { Queue } from 'bullmq';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

// Email queue for sending notifications
export const emailQueue = new Queue('email-notifications', { connection: redis });

export type EmailType = 
  | 'MATCH_SETTLED'
  | 'MATCH_DISPUTED'
  | 'DISPUTE_RESOLVED'
  | 'WITHDRAWAL_APPROVED'
  | 'WITHDRAWAL_REJECTED'
  | 'FUNDS_DEPOSITED'
  | 'MATCH_ACCEPTED';

interface EmailJobData {
  to: string;
  type: EmailType;
  data: Record<string, any>;
}

export async function sendEmail(to: string, type: EmailType, data: Record<string, any>) {
  await emailQueue.add('send-email', {
    to,
    type,
    data,
  }, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  });
}

// Helper functions for common emails
export async function notifyMatchSettled(
  to: string,
  matchId: string,
  amount: number,
  isWinner: boolean
) {
  await sendEmail(to, 'MATCH_SETTLED', {
    matchId,
    amount: (amount / 100).toFixed(2),
    isWinner,
  });
}

export async function notifyDisputeOpened(
  to: string,
  matchId: string,
  reason: string
) {
  await sendEmail(to, 'MATCH_DISPUTED', {
    matchId,
    reason,
  });
}

export async function notifyDisputeResolved(
  to: string,
  matchId: string,
  decision: 'UPHELD' | 'DENIED',
  bondReturned: boolean,
  bondAmount: number
) {
  await sendEmail(to, 'DISPUTE_RESOLVED', {
    matchId,
    decision,
    bondReturned,
    bondAmount: (bondAmount / 100).toFixed(2),
  });
}

export async function notifyWithdrawalApproved(
  to: string,
  amount: number
) {
  await sendEmail(to, 'WITHDRAWAL_APPROVED', {
    amount: (amount / 100).toFixed(2),
  });
}
