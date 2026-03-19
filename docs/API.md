# Ignite API Reference

Base URL: `http://localhost:3001/api/v1`

All authenticated endpoints require `Authorization: Bearer <token>` header.

---

## Auth

### POST /auth/register
Register a new account (email must be on allowlist).

**Body:**
```json
{
  "email": "player@example.com",
  "handle": "player123",
  "password": "securepassword",
  "geo": { "latitude": 34.05, "longitude": -118.24, "state": "CA" }
}
```

### POST /auth/login
Login and receive JWT.

**Body:**
```json
{ "email": "player@example.com", "password": "securepassword" }
```

### GET /auth/me
Get current user profile. *Authenticated*

### PATCH /auth/handle
Change handle (once only). *Authenticated*

**Body:** `{ "handle": "new_handle" }`

### PATCH /auth/profile
Update gaming profiles. *Authenticated*

**Body:** `{ "chessUsername": "...", "psnTag": "...", "xboxTag": "..." }`

---

## Feed

### GET /feed
Get paginated feed.

**Query:** `?cursor=<id>&limit=20&type=CHALLENGE|SOCIAL`

### POST /feed/challenge
Create a challenge post (locks stake). *Authenticated + Geo*

**Body:**
```json
{
  "game": "CHESS",
  "templateId": "<cuid>",
  "stakeCents": 1000,
  "body": "Let's play!",
  "geo": { "latitude": 34.05, "longitude": -118.24, "state": "CA" }
}
```

### POST /feed/social
Create a social post. *Authenticated*

### GET /feed/:postId/comments
Get comments for a post.

### POST /feed/:postId/comments
Add a comment. *Authenticated*

---

## Wallet

### GET /wallet
Get balance `{ available, locked, pending, total }`. *Authenticated*

### POST /wallet/topup
Create Stripe PaymentIntent. *Authenticated + Geo*

**Body:**
```json
{
  "amountCents": 1000,
  "geo": { "latitude": 34.05, "longitude": -118.24, "state": "CA" }
}
```

**Response:**
```json
{ "clientSecret": "pi_..._secret_...", "intentId": "pi_..." }
```

### POST /wallet/withdraw
Initiate withdrawal. *Authenticated + Geo*

**Body:**
```json
{
  "amountCents": 5000,
  "geo": { ... },
  "payoutMethod": { "type": "bank_transfer" }
}
```

### GET /wallet/transactions
Get transaction history. *Authenticated*

---

## Matches

### GET /matches
List open challenges. *Authenticated*

**Query:** `?game=CHESS|NBA2K`

### GET /matches/:id
Get match details. *Authenticated*

### POST /matches/:id/accept
Accept a challenge. *Authenticated + Geo*

**Body:** `{ "geo": { ... } }`

### POST /matches/:id/cancel
Cancel your match (before accepted). *Authenticated*

### GET /matches/templates
List available match templates. *Authenticated*

### Chess Flow

#### POST /matches/:id/chess-link
Submit Chess.com or Lichess game URL.

**Body:** `{ "chessLink": "https://chess.com/game/1234" }`

#### POST /matches/:id/chess-result
Submit result.

**Body:** `{ "result": "I_WON" | "I_LOST" }`

### NBA 2K Flow

#### POST /matches/:id/nba2k-submit
Submit result with proof.

**Body:**
```json
{
  "result": "I_WON",
  "myScore": 102,
  "opponentScore": 98,
  "proofUrl": "https://..."
}
```

#### POST /matches/:id/nba2k-confirm
Confirm opponent's result (loser confirms). *Authenticated*

#### POST /matches/:id/nba2k-dispute
Dispute the result (requires bond). *Authenticated*

**Body:** `{ "reason": "Detailed reason..." }`

---

## Disputes

### GET /disputes
List my disputes. *Authenticated*

### GET /disputes/:id
Get dispute details. *Authenticated*

### POST /disputes/match/:matchId
Open a dispute. *Authenticated*

**Body:** `{ "reason": "..." }`

---

## Admin (requires admin JWT)

### GET /admin/stats
Platform statistics.

### GET /admin/disputes
List all disputes. *Admin*

**Query:** `?status=OPEN|RESOLVED`

### GET /admin/disputes/:id
Get dispute details. *Admin*

### POST /admin/disputes/:id/resolve
Resolve dispute. *Admin*

**Body:**
```json
{ "decision": "UPHELD" | "DENIED", "reason": "Admin notes..." }
```

### GET /admin/withdrawals
List withdrawals. *Admin*

### POST /admin/withdrawals/:id/approve
Approve withdrawal. *Admin*

### POST /admin/withdrawals/:id/reject
Reject withdrawal and return funds. *Admin*

### GET /admin/users
List users. *Admin*

**Query:** `?search=handle_or_email`

### POST /admin/allowlist
Add email to allowlist. *Admin*

**Body:** `{ "email": "user@example.com", "note": "..." }`

---

## Webhooks

### POST /webhooks/stripe
Handle Stripe webhook events (signature verified).

Handles:
- `payment_intent.succeeded` → credits wallet
- `payment_intent.payment_failed` → marks intent failed

---

## Error Responses

All errors follow:
```json
{
  "success": false,
  "error": "Error message",
  "details": { ... } // optional validation details
}
```

**Status codes:**
- `400` Validation error / bad request
- `401` Unauthorized (missing/invalid token)
- `403` Forbidden (wrong role, geo blocked)
- `404` Resource not found
- `409` Conflict (duplicate handle, etc.)
- `500` Internal server error
