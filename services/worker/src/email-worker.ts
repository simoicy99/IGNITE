import { Worker } from 'bullmq';
import Redis from 'ioredis';
import sgMail from '@sendgrid/mail';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'noreply@ignite.gg';

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

interface EmailJobData {
  to: string;
  type: string;
  data: Record<string, any>;
}

const emailWorker = new Worker<EmailJobData>(
  'email-notifications',
  async (job) => {
    const { to, type, data } = job.data;

    if (!SENDGRID_API_KEY) {
      console.log(`[email] Would send ${type} to ${to}:`, data);
      return { sent: false, reason: 'SendGrid not configured' };
    }

    try {
      const msg = buildEmail(type, to, data);
      await sgMail.send(msg);
      console.log(`[email] Sent ${type} to ${to}`);
      return { sent: true };
    } catch (err: any) {
      console.error(`[email] Failed to send ${type} to ${to}:`, err.message);
      throw err;
    }
  },
  { connection: redis, concurrency: 5 }
);

function buildEmail(type: string, to: string, data: any) {
  const templates: Record<string, () => any> = {
    MATCH_SETTLED: () => ({
      subject: data.isWinner 
        ? `You won $${data.amount}! 🎉` 
        : 'Match completed',
      text: data.isWinner
        ? `Congratulations! You won $${data.amount} in match ${data.matchId}. Funds are now available in your wallet.`
        : `Match ${data.matchId} has been completed. Better luck next time!`,
      html: data.isWinner
        ? `<h1>🎉 You Won!</h1><p>Congratulations! You won <strong>$${data.amount}</strong> in match ${data.matchId}.</p><p>Funds are now available in your wallet.</p>`
        : `<h1>Match Completed</h1><p>Match ${data.matchId} has been completed.</p><p>Better luck next time!</p>`,
    }),

    MATCH_DISPUTED: () => ({
      subject: 'Match Dispute Opened ⚠️',
      text: `A dispute has been opened for match ${data.matchId}. Reason: ${data.reason}. An admin will review shortly.`,
      html: `<h1>⚠️ Dispute Opened</h1><p>A dispute has been opened for match ${data.matchId}.</p><p><strong>Reason:</strong> ${data.reason}</p><p>An admin will review shortly.</p>`,
    }),

    DISPUTE_RESOLVED: () => ({
      subject: `Dispute ${data.decision === 'UPHELD' ? 'Upheld' : 'Denied'} 📋`,
      text: `Your dispute for match ${data.matchId} has been ${data.decision.toLowerCase()}. ${data.bondReturned ? `Your $${data.bondAmount} bond has been returned.` : `Your $${data.bondAmount} bond has been forfeited.`}`,
      html: `<h1>📋 Dispute ${data.decision}</h1><p>Your dispute for match ${data.matchId} has been <strong>${data.decided}</strong>.</p>${data.bondReturned ? `<p>Your <strong>$${data.bondAmount}</strong> bond has been returned.</p>` : `<p>Your <strong>$${data.bondAmount}</strong> bond has been forfeited.</p>`}`,
    }),

    WITHDRAWAL_APPROVED: () => ({
      subject: 'Withdrawal Approved 💰',
      text: `Your withdrawal of $${data.amount} has been approved and sent to your bank account.`,
      html: `<h1>💰 Withdrawal Approved</h1><p>Your withdrawal of <strong>$${data.amount}</strong> has been approved and sent to your bank account.</p>`,
    }),

    FUNDS_DEPOSITED: () => ({
      subject: 'Funds Deposited ✅',
      text: `$${data.amount} has been added to your wallet.`,
      html: `<h1>✅ Funds Deposited</h1><p><strong>$${data.amount}</strong> has been added to your wallet.</p>`,
    }),

    MATCH_ACCEPTED: () => ({
      subject: 'Your match was accepted! 🎮',
      text: `Player ${data.opponentHandle} has accepted your $${data.stake} match. Good luck!`,
      html: `<h1>🎮 Match Accepted!</h1><p>Player <strong>@${data.opponentHandle}</strong> has accepted your <strong>$${data.stake}</strong> match.</p><p>Good luck!</p>`,
    }),
  };

  const template = templates[type] || (() => ({ subject: 'IGNITE Notification', text: 'You have a new notification.', html: '<p>You have a new notification.</p>' }));
  const content = template();

  return {
    to,
    from: FROM_EMAIL,
    subject: content.subject,
    text: content.text,
    html: content.html,
  };
}

emailWorker.on('completed', (job) => {
  console.log(`[email-worker] Job ${job.id} completed`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`[email-worker] Job ${job?.id} failed:`, err.message);
});

console.log('Email worker started');

// Graceful shutdown
process.on('SIGTERM', async () => {
  await emailWorker.close();
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await emailWorker.close();
  await redis.quit();
  process.exit(0);
});
