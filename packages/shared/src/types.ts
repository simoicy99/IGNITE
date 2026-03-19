import { WalletAccountType, MatchStatus, Game, NBA2KPlatform, DisputeDecision } from './constants';

// User types
export interface UserProfile {
  id: string;
  email: string;
  handle: string;
  handleChangedCount: number;
  chessUsername: string | null;
  psnTag: string | null;
  xboxTag: string | null;
  lastGeoState: string | null;
  lastGeoAt: Date | null;
  isAdmin: boolean;
  createdAt: Date;
}

export interface PublicUserProfile {
  id: string;
  handle: string;
  chessUsername: string | null;
  psnTag: string | null;
  xboxTag: string | null;
  createdAt: Date;
}

// Wallet types
export interface WalletBalance {
  available: number;
  locked: number;
  pending: number;
  total: number;
}

export interface WalletAccount {
  id: string;
  userId: string;
  type: WalletAccountType;
}

export interface LedgerEntry {
  id: string;
  accountId: string;
  amountCents: number;
  direction: 'CREDIT' | 'DEBIT';
  eventType: string;
  matchId: string | null;
  withdrawalId: string | null;
  idempotencyKey: string;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
}

export interface TransactionView {
  id: string;
  amountCents: number;
  direction: 'CREDIT' | 'DEBIT';
  eventType: string;
  accountType: WalletAccountType;
  matchId: string | null;
  createdAt: Date;
}

// Match types
export interface MatchTemplate {
  id: string;
  game: Game;
  name: string;
  metadata: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
}

export interface Match {
  id: string;
  game: Game;
  templateId: string;
  template: MatchTemplate;
  stakeCents: number;
  status: MatchStatus;
  creatorId: string;
  creator: PublicUserProfile;
  accepterId: string | null;
  accepter: PublicUserProfile | null;
  chessLink: string | null;
  platform: NBA2KPlatform | null;
  submittedAt: Date | null;
  disputeDeadline: Date | null;
  createdAt: Date;
  updatedAt: Date;
  proofs: Proof[];
  dispute: Dispute | null;
  post: Post | null;
}

export interface MatchSummary {
  id: string;
  game: Game;
  stakeCents: number;
  status: MatchStatus;
  creatorHandle: string;
  accepterHandle: string | null;
  createdAt: Date;
}

// Proof types
export interface Proof {
  id: string;
  matchId: string;
  userId: string;
  type: string;
  url: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

// Dispute types
export interface Dispute {
  id: string;
  matchId: string;
  openedById: string;
  status: 'OPEN' | 'RESOLVED';
  bondCents: number;
  bondLocked: boolean;
  decision: DisputeDecision | null;
  decidedById: string | null;
  reason: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface DisputeWithDetails extends Dispute {
  match: Match;
  openedBy: PublicUserProfile;
}

// Post types
export interface Post {
  id: string;
  userId: string;
  user: PublicUserProfile;
  type: 'CHALLENGE' | 'SOCIAL';
  body: string | null;
  mediaUrl: string | null;
  matchId: string | null;
  match: MatchSummary | null;
  createdAt: Date;
  commentCount: number;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  user: PublicUserProfile;
  body: string;
  createdAt: Date;
}

// Withdrawal types
export interface Withdrawal {
  id: string;
  userId: string;
  amountCents: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  approvedById: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Payment types
export interface PaymentIntentResult {
  clientSecret: string;
  intentId: string;
}

// API Response types
export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}

// Auth types
export interface AuthTokenPayload {
  userId: string;
  email: string;
  handle: string;
  isAdmin: boolean;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

// Geo types
export interface GeoLocation {
  latitude: number;
  longitude: number;
  state: string;
}

// Job types
export interface ChessVerifyJobData {
  matchId: string;
  winnerId: string;
  loserId: string;
  stakeCents: number;
}

export interface DisputeTimeoutJobData {
  matchId: string;
  winnerId: string;
  loserId: string;
  stakeCents: number;
}

export interface SettleMatchJobData {
  matchId: string;
  winnerId: string;
  loserId: string;
  stakeCents: number;
}
