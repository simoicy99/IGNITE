# IGNITE API Documentation

## Base URL
```
Development: http://localhost:3001/api/v1
Production: https://api.ignite.gg/api/v1
```

## Authentication

### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "cmn...",
      "email": "user@example.com",
      "handle": "username",
      "isAdmin": false
    }
  }
}
```

### Register
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "handle": "username",
  "password": "password123",
  "geo": {
    "state": "CA",
    "latitude": 37.7749,
    "longitude": -122.4194
  }
}
```

---

## Wallet

### Get Balances
```http
GET /wallet
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "available": 10000,
    "locked": 0,
    "pending": 0,
    "total": 10000
  }
}
```

### Top Up (Card - Nuvei)
```http
POST /wallet/topup/card
Authorization: Bearer {token}
Content-Type: application/json

{
  "amountCents": 2000,
  "geo": { "state": "CA", "latitude": 37.7749, "longitude": -122.4194 }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionToken": "...",
    "orderId": "...",
    "redirectUrl": "https://..."
  }
}
```

### Top Up (Bank Transfer - Nuvei)
```http
POST /wallet/topup/bank
Authorization: Bearer {token}
Content-Type: application/json

{
  "amountCents": 5000,
  "geo": { "state": "CA", "latitude": 37.7749, "longitude": -122.4194 }
}
```

### Withdraw to Bank
```http
POST /wallet/withdraw/bank
Authorization: Bearer {token}
Content-Type: application/json

{
  "amountCents": 1000,
  "geo": { "state": "CA", "latitude": 37.7749, "longitude": -122.4194 },
  "bankAccount": {
    "accountNumber": "1234567890",
    "routingNumber": "021000021",
    "accountType": "checking",
    "holderName": "John Doe"
  }
}
```

### Get Transaction History
```http
GET /wallet/transactions?limit=50&cursor=...
Authorization: Bearer {token}
```

---

## Matches

### List Open Matches
```http
GET /matches?game=CHESS&cursor=&limit=20
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "cmn...",
        "game": "CHESS",
        "stakeCents": 1000,
        "status": "FUNDED",
        "creator": { "id": "...", "handle": "player1" },
        "template": { "name": "Chess 5min Blitz" }
      }
    ],
    "nextCursor": "..."
  }
}
```

### Get Match Details
```http
GET /matches/{id}
Authorization: Bearer {token}
```

### Accept Match
```http
POST /matches/{id}/accept
Authorization: Bearer {token}
Content-Type: application/json

{
  "geo": { "state": "CA", "latitude": 37.7749, "longitude": -122.4194 }
}
```

### Submit Chess Link
```http
POST /matches/{id}/chess-link
Authorization: Bearer {token}
Content-Type: application/json

{
  "chessLink": "https://chess.com/game/12345"
}
```

### Submit Chess Result
```http
POST /matches/{id}/chess-result
Authorization: Bearer {token}
Content-Type: application/json

{
  "result": "I_WON"  // or "I_LOST"
}
```

### Submit NBA 2K Result
```http
POST /matches/{id}/nba2k-submit
Authorization: Bearer {token}
Content-Type: application/json

{
  "result": "I_WON",
  "myScore": 105,
  "opponentScore": 98,
  "proofUrl": "https://..."
}
```

### Confirm NBA 2K Result
```http
POST /matches/{id}/nba2k-confirm
Authorization: Bearer {token}
```

### Cancel Match
```http
POST /matches/{id}/cancel
Authorization: Bearer {token}
```

---

## Disputes

### List My Disputes
```http
GET /disputes
Authorization: Bearer {token}
```

### Get Dispute Details
```http
GET /disputes/{id}
Authorization: Bearer {token}
```

### Open Dispute
```http
POST /disputes/match/{matchId}
Authorization: Bearer {token}
Content-Type: application/json

{
  "reason": "Opponent cheated",
  "evidence": "Screenshot shows..."
}
```

---

## Feed

### Get Feed
```http
GET /feed?cursor=&limit=20&type=CHALLENGE
Authorization: Bearer {token}
```

### Create Challenge
```http
POST /feed/challenge
Authorization: Bearer {token}
Content-Type: application/json

{
  "game": "CHESS",
  "templateId": "cmmx3rvrt0003cc6nbvhwmbiq",
  "stakeCents": 1000,
  "body": "Let's play!",
  "geo": { "state": "CA", "latitude": 37.7749, "longitude": -122.4194 }
}
```

### Get Match Templates
```http
GET /feed/templates
Authorization: Bearer {token}
```

---

## Admin Endpoints

### Get Stats
```http
GET /admin/stats
Authorization: Bearer {admin_token}
```

### List All Matches
```http
GET /admin/matches?status=DISPUTED&cursor=&limit=20
Authorization: Bearer {admin_token}
```

### Get Match Details (Admin)
```http
GET /admin/matches/{id}
Authorization: Bearer {admin_token}
```

### Cancel Match (Admin)
```http
POST /admin/matches/{id}/cancel
Authorization: Bearer {admin_token}
```

### Force Settle Match (Admin)
```http
POST /admin/matches/{id}/settle
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "winnerId": "cmn..."
}
```

### List Disputes
```http
GET /admin/disputes?status=OPEN
Authorization: Bearer {admin_token}
```

### Resolve Dispute
```http
POST /admin/disputes/{id}/resolve
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "decision": "UPHELD",  // or "DENIED"
  "reason": "Evidence supports disputer's claim"
}
```

### List Withdrawals
```http
GET /admin/withdrawals?status=PENDING
Authorization: Bearer {admin_token}
```

### Approve Withdrawal
```http
POST /admin/withdrawals/{id}/approve
Authorization: Bearer {admin_token}
```

### Reject Withdrawal
```http
POST /admin/withdrawals/{id}/reject
Authorization: Bearer {admin_token}
```

### List Users
```http
GET /admin/users?search=username&cursor=
Authorization: Bearer {admin_token}
```

### Add to Allowlist
```http
POST /admin/allowlist
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "email": "user@example.com",
  "note": "VIP player"
}
```

---

## Webhooks

### Nuvei Payment Webhook
```http
POST /webhooks/nuvei
Content-Type: application/json
X-Nuvei-Signature: {signature}

{
  "orderId": "...",
  "status": "approved",
  "userTokenId": "...",
  "amount": "20.00"
}
```

---

## Health Check

### Check API Health
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-04-04T20:00:00.000Z",
  "checks": {
    "database": "healthy",
    "redis": "healthy"
  }
}
```

### Detailed Health (Admin)
```http
GET /health/detailed
Authorization: Bearer {admin_token}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "error": "Validation error",
  "details": {
    "fieldErrors": {
      "email": ["Invalid email format"]
    }
  }
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": "Access denied"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "Match not found"
}
```

### 429 Rate Limited
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "retryAfter": 60
}
```

---

## Rate Limits

- **Authenticated:** 100 requests per minute
- **Unauthenticated:** 20 requests per minute
- **Webhooks:** No limit (but verify signature)

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

---

## Match Status Flow

```
CREATED → ACCEPTED → FUNDED → IN_PROGRESS → SUBMITTED → VERIFIED → SETTLED
                              ↓                    ↓
                              CANCELED            DISPUTED → RESOLVED
```

## Wallet Account Types

- **AVAILABLE:** Funds ready to use
- **LOCKED:** Funds in escrow for active match
- **PENDING:** Winnings awaiting verification (Chess only)

---

*Last updated: April 4, 2026*
