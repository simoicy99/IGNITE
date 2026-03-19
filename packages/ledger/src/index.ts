import { PrismaClient } from '@prisma/client';
import { calcFee, calcPot, calcWinnerPayout, calcDisputeBond } from '@ignite/shared';

const prisma = new PrismaClient();

export { prisma };

/**
 * Get or create a wallet account for a user.
 */
async function getOrCreateAccount(
  userId: string,
  type: 'AVAILABLE' | 'LOCKED' | 'PENDING'
): Promise<{ id: string }> {
  const existing = await prisma.walletAccount.findUnique({
    where: { userId_type: { userId, type } },
  });
  if (existing) return existing;

  return prisma.walletAccount.create({
    data: { userId, type },
  });
}

/**
 * Get balance for a specific wallet account type.
 * Computes balance by summing ledger entries.
 */
export async function getBalance(
  userId: string,
  type: 'AVAILABLE' | 'LOCKED' | 'PENDING'
): Promise<number> {
  const account = await prisma.walletAccount.findUnique({
    where: { userId_type: { userId, type } },
    include: { entries: true },
  });
  if (!account) return 0;
  return account.entries.reduce((sum, e) => {
    return e.direction === 'CREDIT' ? sum + e.amountCents : sum - e.amountCents;
  }, 0);
}

/**
 * Get all balances for a user.
 */
export async function getAllBalances(
  userId: string
): Promise<{ available: number; locked: number; pending: number; total: number }> {
  const [available, locked, pending] = await Promise.all([
    getBalance(userId, 'AVAILABLE'),
    getBalance(userId, 'LOCKED'),
    getBalance(userId, 'PENDING'),
  ]);
  return { available, locked, pending, total: available + locked + pending };
}

/**
 * Credit an account. Idempotent - will not double-credit on retry.
 */
export async function credit(
  accountId: string,
  amountCents: number,
  eventType: string,
  idempotencyKey: string,
  meta?: { matchId?: string; withdrawalId?: string; metadata?: object }
): Promise<void> {
  await prisma.ledgerEntry.upsert({
    where: { idempotencyKey },
    create: {
      accountId,
      amountCents,
      direction: 'CREDIT',
      eventType,
      idempotencyKey,
      matchId: meta?.matchId,
      withdrawalId: meta?.withdrawalId,
      metadata: meta?.metadata ?? null,
    },
    update: {},
  });
}

/**
 * Debit an account. Idempotent - will not double-debit on retry.
 */
export async function debit(
  accountId: string,
  amountCents: number,
  eventType: string,
  idempotencyKey: string,
  meta?: { matchId?: string; withdrawalId?: string; metadata?: object }
): Promise<void> {
  await prisma.ledgerEntry.upsert({
    where: { idempotencyKey },
    create: {
      accountId,
      amountCents,
      direction: 'DEBIT',
      eventType,
      idempotencyKey,
      matchId: meta?.matchId,
      withdrawalId: meta?.withdrawalId,
      metadata: meta?.metadata ?? null,
    },
    update: {},
  });
}

/**
 * Transfer funds between two accounts atomically.
 */
export async function transfer(
  fromAccountId: string,
  toAccountId: string,
  amountCents: number,
  eventType: string,
  idempotencyKey: string,
  meta?: { matchId?: string; withdrawalId?: string; metadata?: object }
): Promise<void> {
  await prisma.$transaction([
    prisma.ledgerEntry.upsert({
      where: { idempotencyKey: `${idempotencyKey}:debit` },
      create: {
        accountId: fromAccountId,
        amountCents,
        direction: 'DEBIT',
        eventType,
        idempotencyKey: `${idempotencyKey}:debit`,
        matchId: meta?.matchId,
        withdrawalId: meta?.withdrawalId,
        metadata: meta?.metadata ?? null,
      },
      update: {},
    }),
    prisma.ledgerEntry.upsert({
      where: { idempotencyKey: `${idempotencyKey}:credit` },
      create: {
        accountId: toAccountId,
        amountCents,
        direction: 'CREDIT',
        eventType,
        idempotencyKey: `${idempotencyKey}:credit`,
        matchId: meta?.matchId,
        withdrawalId: meta?.withdrawalId,
        metadata: meta?.metadata ?? null,
      },
      update: {},
    }),
  ]);
}

/**
 * Lock funds: AVAILABLE → LOCKED
 * Used when a player enters a match.
 */
export async function lockFunds(
  userId: string,
  amountCents: number,
  matchId: string,
  idempotencyKey: string
): Promise<void> {
  // Verify sufficient balance
  const available = await getBalance(userId, 'AVAILABLE');
  if (available < amountCents) {
    throw new Error(`Insufficient funds: available=${available}, required=${amountCents}`);
  }

  const [availableAccount, lockedAccount] = await Promise.all([
    getOrCreateAccount(userId, 'AVAILABLE'),
    getOrCreateAccount(userId, 'LOCKED'),
  ]);

  await transfer(
    availableAccount.id,
    lockedAccount.id,
    amountCents,
    'MATCH_LOCK',
    idempotencyKey,
    { matchId }
  );
}

/**
 * Unlock funds: LOCKED → AVAILABLE
 * Used when a match is canceled or refunded.
 */
export async function unlockFunds(
  userId: string,
  amountCents: number,
  matchId: string,
  idempotencyKey: string
): Promise<void> {
  const [lockedAccount, availableAccount] = await Promise.all([
    getOrCreateAccount(userId, 'LOCKED'),
    getOrCreateAccount(userId, 'AVAILABLE'),
  ]);

  await transfer(
    lockedAccount.id,
    availableAccount.id,
    amountCents,
    'MATCH_UNLOCK',
    idempotencyKey,
    { matchId }
  );
}

/**
 * Credit PENDING account.
 * Used after both players confirm result - winner gets credited to Pending.
 */
export async function creditPending(
  userId: string,
  amountCents: number,
  matchId: string,
  idempotencyKey: string
): Promise<void> {
  const pendingAccount = await getOrCreateAccount(userId, 'PENDING');
  await credit(pendingAccount.id, amountCents, 'MATCH_WIN_PENDING', idempotencyKey, { matchId });
}

/**
 * Move from PENDING to AVAILABLE.
 * Called after chess-verify job confirms result.
 */
export async function pendingToAvailable(
  userId: string,
  amountCents: number,
  matchId: string,
  idempotencyKey: string
): Promise<void> {
  const [pendingAccount, availableAccount] = await Promise.all([
    getOrCreateAccount(userId, 'PENDING'),
    getOrCreateAccount(userId, 'AVAILABLE'),
  ]);

  await transfer(
    pendingAccount.id,
    availableAccount.id,
    amountCents,
    'MATCH_WIN_VERIFIED',
    idempotencyKey,
    { matchId }
  );
}

/**
 * Top-up: credit user's AVAILABLE account after payment confirmed.
 */
export async function topUp(
  userId: string,
  amountCents: number,
  paymentIntentId: string
): Promise<void> {
  const availableAccount = await getOrCreateAccount(userId, 'AVAILABLE');
  await credit(
    availableAccount.id,
    amountCents,
    'TOP_UP',
    `topup:${paymentIntentId}`,
    { metadata: { paymentIntentId } }
  );
}

/**
 * Lock dispute bond from AVAILABLE account.
 */
export async function lockDisputeBond(
  userId: string,
  bondCents: number,
  matchId: string,
  idempotencyKey: string
): Promise<void> {
  const available = await getBalance(userId, 'AVAILABLE');
  if (available < bondCents) {
    throw new Error(`Insufficient funds for dispute bond: available=${available}, required=${bondCents}`);
  }

  const [availableAccount, lockedAccount] = await Promise.all([
    getOrCreateAccount(userId, 'AVAILABLE'),
    getOrCreateAccount(userId, 'LOCKED'),
  ]);

  await transfer(
    availableAccount.id,
    lockedAccount.id,
    bondCents,
    'DISPUTE_BOND_LOCK',
    idempotencyKey,
    { matchId }
  );
}

/**
 * Release dispute bond back to AVAILABLE.
 */
export async function releaseDisputeBond(
  userId: string,
  bondCents: number,
  matchId: string,
  idempotencyKey: string
): Promise<void> {
  const [lockedAccount, availableAccount] = await Promise.all([
    getOrCreateAccount(userId, 'LOCKED'),
    getOrCreateAccount(userId, 'AVAILABLE'),
  ]);

  await transfer(
    lockedAccount.id,
    availableAccount.id,
    bondCents,
    'DISPUTE_BOND_RELEASE',
    idempotencyKey,
    { matchId }
  );
}

/**
 * Complete match settlement. Handles the full accounting for a resolved match:
 * 1. Debit both players' LOCKED accounts (stake amounts)
 * 2. Credit winner's PENDING account (pot minus fee)
 * 3. The fee effectively disappears (no fee account needed for MVP)
 */
export async function settleMatch(
  winnerId: string,
  loserId: string,
  stakeCents: number,
  matchId: string
): Promise<void> {
  const pot = calcPot(stakeCents);
  const winnerPayout = calcWinnerPayout(stakeCents);

  const [
    winnerLockedAccount,
    loserLockedAccount,
    winnerPendingAccount,
  ] = await Promise.all([
    getOrCreateAccount(winnerId, 'LOCKED'),
    getOrCreateAccount(loserId, 'LOCKED'),
    getOrCreateAccount(winnerId, 'PENDING'),
  ]);

  // Debit both locked accounts (release the stake)
  await prisma.$transaction([
    // Debit winner's locked stake
    prisma.ledgerEntry.upsert({
      where: { idempotencyKey: `settle:${matchId}:winner:debit` },
      create: {
        accountId: winnerLockedAccount.id,
        amountCents: stakeCents,
        direction: 'DEBIT',
        eventType: 'MATCH_SETTLE_DEBIT',
        idempotencyKey: `settle:${matchId}:winner:debit`,
        matchId,
      },
      update: {},
    }),
    // Debit loser's locked stake
    prisma.ledgerEntry.upsert({
      where: { idempotencyKey: `settle:${matchId}:loser:debit` },
      create: {
        accountId: loserLockedAccount.id,
        amountCents: stakeCents,
        direction: 'DEBIT',
        eventType: 'MATCH_SETTLE_DEBIT',
        idempotencyKey: `settle:${matchId}:loser:debit`,
        matchId,
      },
      update: {},
    }),
    // Credit winner's pending (pot - fee)
    prisma.ledgerEntry.upsert({
      where: { idempotencyKey: `settle:${matchId}:winner:credit` },
      create: {
        accountId: winnerPendingAccount.id,
        amountCents: winnerPayout,
        direction: 'CREDIT',
        eventType: 'MATCH_WIN_PENDING',
        idempotencyKey: `settle:${matchId}:winner:credit`,
        matchId,
        metadata: { pot, fee: calcFee(pot), winnerPayout },
      },
      update: {},
    }),
  ]);
}

/**
 * Settle dispute: award bond to winner or return to disputer based on decision.
 * UPHELD: dispute was valid, disputer wins (gets bond back + opponent's bond)
 * DENIED: dispute was invalid, disputer loses bond to opponent
 */
export async function settleDispute(
  matchId: string,
  disputerId: string,
  opponentId: string,
  bondCents: number,
  decision: 'UPHELD' | 'DENIED',
  winnerId: string // the actual match winner (not dispute winner)
): Promise<void> {
  const [
    disputerLockedAccount,
    disputerAvailableAccount,
    opponentAvailableAccount,
    winnerLockedAccount,
    winnerPendingAccount,
    loserLockedAccount,
  ] = await Promise.all([
    getOrCreateAccount(disputerId, 'LOCKED'),
    getOrCreateAccount(disputerId, 'AVAILABLE'),
    getOrCreateAccount(opponentId, 'AVAILABLE'),
    getOrCreateAccount(winnerId, 'LOCKED'),
    getOrCreateAccount(winnerId, 'PENDING'),
    getOrCreateAccount(disputerId === winnerId ? opponentId : disputerId, 'LOCKED'),
  ]);

  const loserId = disputerId === winnerId ? opponentId : disputerId;
  const pot = bondCents * 10; // bond is 10% of pot
  const winnerPayout = calcWinnerPayout(pot / 2); // recalc payout

  if (decision === 'UPHELD') {
    // Dispute was valid:
    // - Disputer gets bond back
    // - Original result is reversed if disputer was the loser
    await prisma.$transaction([
      // Return disputer's bond
      prisma.ledgerEntry.upsert({
        where: { idempotencyKey: `dispute:${matchId}:bond:return` },
        create: {
          accountId: disputerLockedAccount.id,
          amountCents: bondCents,
          direction: 'DEBIT',
          eventType: 'DISPUTE_BOND_RETURN',
          idempotencyKey: `dispute:${matchId}:bond:return`,
          matchId,
        },
        update: {},
      }),
      prisma.ledgerEntry.upsert({
        where: { idempotencyKey: `dispute:${matchId}:bond:return:credit` },
        create: {
          accountId: disputerAvailableAccount.id,
          amountCents: bondCents,
          direction: 'CREDIT',
          eventType: 'DISPUTE_BOND_RETURN',
          idempotencyKey: `dispute:${matchId}:bond:return:credit`,
          matchId,
        },
        update: {},
      }),
    ]);
  } else {
    // DENIED: dispute was invalid
    // - Disputer loses bond (goes to opponent)
    await prisma.$transaction([
      prisma.ledgerEntry.upsert({
        where: { idempotencyKey: `dispute:${matchId}:bond:forfeit` },
        create: {
          accountId: disputerLockedAccount.id,
          amountCents: bondCents,
          direction: 'DEBIT',
          eventType: 'DISPUTE_BOND_FORFEIT',
          idempotencyKey: `dispute:${matchId}:bond:forfeit`,
          matchId,
        },
        update: {},
      }),
      prisma.ledgerEntry.upsert({
        where: { idempotencyKey: `dispute:${matchId}:bond:award` },
        create: {
          accountId: opponentAvailableAccount.id,
          amountCents: bondCents,
          direction: 'CREDIT',
          eventType: 'DISPUTE_BOND_AWARD',
          idempotencyKey: `dispute:${matchId}:bond:award`,
          matchId,
        },
        update: {},
      }),
    ]);
  }
}

/**
 * Initiate withdrawal: debit from AVAILABLE
 */
export async function initiateWithdrawal(
  userId: string,
  amountCents: number,
  withdrawalId: string
): Promise<void> {
  const available = await getBalance(userId, 'AVAILABLE');
  if (available < amountCents) {
    throw new Error(`Insufficient funds: available=${available}, required=${amountCents}`);
  }

  const availableAccount = await getOrCreateAccount(userId, 'AVAILABLE');
  await debit(
    availableAccount.id,
    amountCents,
    'WITHDRAWAL_INITIATED',
    `withdrawal:${withdrawalId}:debit`,
    { withdrawalId }
  );
}

/**
 * Get transaction history for a user across all accounts.
 */
export async function getTransactions(
  userId: string,
  limit: number = 50,
  cursor?: string
): Promise<{ entries: Array<{ entry: any; accountType: string }>; nextCursor: string | null }> {
  const accounts = await prisma.walletAccount.findMany({
    where: { userId },
    include: {
      entries: {
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
      },
    },
  });

  const allEntries: Array<{ entry: any; accountType: string }> = [];
  for (const account of accounts) {
    for (const entry of account.entries) {
      allEntries.push({ entry, accountType: account.type });
    }
  }

  // Sort by createdAt descending
  allEntries.sort((a, b) => b.entry.createdAt.getTime() - a.entry.createdAt.getTime());

  const limited = allEntries.slice(0, limit);
  const hasMore = allEntries.length > limit;
  const nextCursor = hasMore ? limited[limited.length - 1].entry.id : null;

  return { entries: limited, nextCursor };
}
