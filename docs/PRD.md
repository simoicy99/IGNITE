# Ignite MVP — Product Requirements Document

## Overview

Ignite is a competitive gaming wagering platform. Users can challenge each other to chess or NBA 2K matches with real money stakes. The platform handles matchmaking, escrow, result verification, and settlement.

## Core User Flow

1. User registers (invite-only via email allowlist)
2. User tops up wallet via Stripe
3. User posts a challenge to the feed
4. Opponent accepts challenge
5. Both players play their match
6. Results are submitted and verified
7. Winner is credited to their wallet

---

## Business Rules

### Invite System
- Registration requires the email to be on the `AllowlistEmail` table
- Admins manage the allowlist via admin console
- No self-invite; admin must add emails

### Geographic Restrictions
- Allowed states: **CA, NY, TX**
- GPS location is checked before each of these actions:
  - Top-up wallet
  - Create a challenge
  - Accept a challenge
  - Withdraw funds
- Location is stored as `user.lastGeoState` after each check
- Invalid state → 403 error

### Handle Rules
- Handles are unique
- A handle can be changed exactly **once**
- `handleChangedCount` tracks usage (max 1)

### Wallet

Three wallet account types:
| Account | Purpose |
|---------|---------|
| AVAILABLE | Funds ready for use |
| LOCKED | Funds committed to active matches |
| PENDING | Winnings awaiting verification |

**Top-up amounts (fixed):** $10, $20, $50, $100, $200, $500, $1,000

**Stake range:** $10 to $1,000

**Withdrawal:** Only from AVAILABLE balance; requires identity verification (admin approval)

### Match Fees
- Platform fee: **5% of total pot**
- Total pot = stake × 2
- Winner receives: pot − fee = 95% of pot

### Dispute System
- **Dispute window:** 10 minutes after winner submits result
- **Dispute bond:** 10% of total pot (locked from disputer's AVAILABLE)
- If UPHELD: disputer's bond returned, result may reverse
- If DENIED: disputer's bond goes to opponent

### Chess Match Flow
1. Creator creates challenge (stake locked AVAILABLE → LOCKED)
2. Accepter accepts (stake locked)
3. Both players play on Chess.com or Lichess
4. One player submits game link
5. Both players submit their result (I_WON / I_LOST)
6. If agree → winner's winnings go to PENDING; chess-verify job enqueued
7. If disagree → admin reviews
8. After verification → PENDING → AVAILABLE

### NBA 2K Match Flow
1. Creator creates challenge with platform (PS5 or Xbox)
2. Accepter accepts
3. Players play
4. Winner submits result + screenshot proof
5. **Dispute window opens (10 min)**
6. If no dispute: auto-confirmed by worker → settle and pay out
7. If confirmed by loser: settle immediately
8. If disputed: admin reviews

---

## Games Supported

| Game | Platforms | Verification |
|------|-----------|--------------|
| Chess | Chess.com, Lichess | Game link + API verification |
| NBA 2K | PS5, Xbox | Screenshot proof |

---

## Wallet Ledger

The ledger uses double-entry bookkeeping:
- Every credit has a corresponding debit
- All entries are idempotent (idempotency key prevents double-processing)
- Balance is computed by summing all entries per account

### Key Event Types
| Event | Direction | Account |
|-------|-----------|---------|
| TOP_UP | CREDIT | AVAILABLE |
| MATCH_LOCK | DEBIT/CREDIT | AVAILABLE → LOCKED |
| MATCH_UNLOCK | DEBIT/CREDIT | LOCKED → AVAILABLE |
| MATCH_WIN_PENDING | CREDIT | PENDING |
| MATCH_WIN_VERIFIED | DEBIT/CREDIT | PENDING → AVAILABLE |
| MATCH_SETTLE_DEBIT | DEBIT | LOCKED |
| WITHDRAWAL_INITIATED | DEBIT | AVAILABLE |
| DISPUTE_BOND_LOCK | DEBIT/CREDIT | AVAILABLE → LOCKED |
| DISPUTE_BOND_RETURN | DEBIT/CREDIT | LOCKED → AVAILABLE |
| DISPUTE_BOND_FORFEIT | DEBIT | LOCKED |
| DISPUTE_BOND_AWARD | CREDIT | AVAILABLE |
