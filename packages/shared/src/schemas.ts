import { z } from 'zod';
import {
  TOP_UP_AMOUNTS_CENTS,
  MIN_STAKE_CENTS,
  MAX_STAKE_CENTS,
  ALLOWED_STATES,
  NBA2K_PLATFORMS,
  GAMES,
} from './constants';

// Geo location schema (used in many requests)
export const GeoSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  state: z.enum(ALLOWED_STATES),
});

export type Geo = z.infer<typeof GeoSchema>;

// Auth schemas
export const RegisterSchema = z.object({
  email: z.string().email(),
  handle: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, 'Handle must be alphanumeric with underscores only'),
  password: z.string().min(8),
  geo: GeoSchema,
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type LoginInput = z.infer<typeof LoginSchema>;

// Feed schemas
export const CreateChallengePostSchema = z.object({
  game: z.enum([GAMES.CHESS, GAMES.NBA2K]),
  templateId: z.string().cuid(),
  stakeCents: z.number().int().min(MIN_STAKE_CENTS).max(MAX_STAKE_CENTS),
  platform: z.enum([NBA2K_PLATFORMS.PS5, NBA2K_PLATFORMS.XBOX]).optional(),
  body: z.string().max(500).optional(),
  geo: GeoSchema,
});

export type CreateChallengePostInput = z.infer<typeof CreateChallengePostSchema>;

export const CreateSocialPostSchema = z.object({
  body: z.string().min(1).max(2000),
  mediaUrl: z.string().url().optional(),
});

export type CreateSocialPostInput = z.infer<typeof CreateSocialPostSchema>;

export const CreateCommentSchema = z.object({
  body: z.string().min(1).max(1000),
});

export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

// Match schemas
export const AcceptMatchSchema = z.object({
  geo: GeoSchema,
});

export type AcceptMatchInput = z.infer<typeof AcceptMatchSchema>;

export const SubmitChessLinkSchema = z.object({
  chessLink: z.string().url().refine(
    (url) => url.includes('chess.com') || url.includes('lichess.org'),
    'Must be a Chess.com or Lichess URL'
  ),
});

export type SubmitChessLinkInput = z.infer<typeof SubmitChessLinkSchema>;

export const ConfirmChessLinkSchema = z.object({
  confirmed: z.literal(true),
});

export type ConfirmChessLinkInput = z.infer<typeof ConfirmChessLinkSchema>;

export const SubmitChessResultSchema = z.object({
  result: z.enum(['I_WON', 'I_LOST']),
});

export type SubmitChessResultInput = z.infer<typeof SubmitChessResultSchema>;

export const SubmitNba2kResultSchema = z.object({
  result: z.enum(['I_WON', 'I_LOST']),
  myScore: z.number().int().min(0).max(999),
  opponentScore: z.number().int().min(0).max(999),
  proofUrl: z.string().url(),
});

export type SubmitNba2kResultInput = z.infer<typeof SubmitNba2kResultSchema>;

export const ConfirmNba2kResultSchema = z.object({
  confirmed: z.boolean(),
});

export type ConfirmNba2kResultInput = z.infer<typeof ConfirmNba2kResultSchema>;

// Dispute schemas
export const OpenDisputeSchema = z.object({
  reason: z.string().min(10).max(2000),
});

export type OpenDisputeInput = z.infer<typeof OpenDisputeSchema>;

export const ResolveDisputeSchema = z.object({
  decision: z.enum(['UPHELD', 'DENIED']),
  reason: z.string().min(10).max(2000),
});

export type ResolveDisputeInput = z.infer<typeof ResolveDisputeSchema>;

// Wallet schemas
export const TopUpSchema = z.object({
  amountCents: z.number().int().refine(
    (v) => (TOP_UP_AMOUNTS_CENTS as readonly number[]).includes(v),
    `Amount must be one of: ${TOP_UP_AMOUNTS_CENTS.map((c) => `$${c / 100}`).join(', ')}`
  ),
  geo: GeoSchema,
});

export type TopUpInput = z.infer<typeof TopUpSchema>;

export const WithdrawSchema = z.object({
  amountCents: z.number().int().min(100),
  geo: GeoSchema,
  payoutMethod: z.object({
    type: z.enum(['bank_transfer', 'check']),
    accountId: z.string().optional(),
  }),
});

export type WithdrawInput = z.infer<typeof WithdrawSchema>;

// Profile schemas
export const UpdateHandleSchema = z.object({
  handle: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, 'Handle must be alphanumeric with underscores only'),
});

export type UpdateHandleInput = z.infer<typeof UpdateHandleSchema>;

export const UpdateProfileSchema = z.object({
  chessUsername: z.string().min(3).max(50).optional(),
  psnTag: z.string().min(3).max(50).optional(),
  xboxTag: z.string().min(3).max(50).optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

// Admin schemas
export const AddAllowlistEmailSchema = z.object({
  email: z.string().email(),
  note: z.string().max(500).optional(),
});

export type AddAllowlistEmailInput = z.infer<typeof AddAllowlistEmailSchema>;

// Pagination schema
export const PaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof PaginationSchema>;
