export const TOP_UP_AMOUNTS_CENTS = [1000, 2000, 5000, 10000, 20000, 50000, 100000] as const;
export const MIN_STAKE_CENTS = 1000;
export const MAX_STAKE_CENTS = 100000;
export const PLATFORM_FEE_PERCENT = 0.05;
export const DISPUTE_BOND_PERCENT = 0.10;
export const DISPUTE_WINDOW_MINUTES = 10;
export const ALLOWED_STATES = ["CA", "NY", "TX"] as const;
export type AllowedState = typeof ALLOWED_STATES[number];

export const GAMES = {
  CHESS: "CHESS",
  NBA2K: "NBA2K",
} as const;

export type Game = typeof GAMES[keyof typeof GAMES];

export const NBA2K_PLATFORMS = {
  PS5: "PS5",
  XBOX: "XBOX",
} as const;

export type NBA2KPlatform = typeof NBA2K_PLATFORMS[keyof typeof NBA2K_PLATFORMS];

export function calcFee(potCents: number): number {
  return Math.round(potCents * PLATFORM_FEE_PERCENT);
}

export function calcDisputeBond(potCents: number): number {
  return Math.round(potCents * DISPUTE_BOND_PERCENT);
}

export function calcPot(stakeCents: number): number {
  return stakeCents * 2;
}

export function calcWinnerPayout(stakeCents: number): number {
  const pot = calcPot(stakeCents);
  return pot - calcFee(pot);
}

export const WALLET_ACCOUNT_TYPES = {
  AVAILABLE: "AVAILABLE",
  LOCKED: "LOCKED",
  PENDING: "PENDING",
} as const;

export type WalletAccountType = typeof WALLET_ACCOUNT_TYPES[keyof typeof WALLET_ACCOUNT_TYPES];

export const MATCH_STATUSES = {
  CREATED: "CREATED",
  ACCEPTED: "ACCEPTED",
  FUNDED: "FUNDED",
  IN_PROGRESS: "IN_PROGRESS",
  SUBMITTED: "SUBMITTED",
  VERIFIED: "VERIFIED",
  SETTLED: "SETTLED",
  DISPUTED: "DISPUTED",
  RESOLVED: "RESOLVED",
  CANCELED: "CANCELED",
} as const;

export type MatchStatus = typeof MATCH_STATUSES[keyof typeof MATCH_STATUSES];

export const RESULT_OPTIONS = {
  I_WON: "I_WON",
  I_LOST: "I_LOST",
} as const;

export type ResultOption = typeof RESULT_OPTIONS[keyof typeof RESULT_OPTIONS];

export const DISPUTE_DECISIONS = {
  UPHELD: "UPHELD",
  DENIED: "DENIED",
} as const;

export type DisputeDecision = typeof DISPUTE_DECISIONS[keyof typeof DISPUTE_DECISIONS];
