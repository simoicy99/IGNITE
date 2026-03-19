# Ignite MVP

A competitive gaming wagering platform for Chess and NBA 2K matches.

## Stack

- **Mobile**: Expo SDK 51 (React Native + Web)
- **Admin**: Next.js 14
- **API**: Fastify + TypeScript
- **Worker**: BullMQ + Redis
- **Database**: PostgreSQL + Prisma
- **Payments**: Stripe (Test Mode)
- **Storage**: MinIO (S3-compatible)

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9.1.0+
- Docker + Docker Compose

### 1. Clone and install

```bash
git clone <repo>
cd ignite
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Start infrastructure

```bash
pnpm docker:up
```

This starts:
- PostgreSQL on port 5432
- Redis on port 6379
- MinIO on ports 9000/9001

### 4. Run database migrations

```bash
pnpm db:migrate
pnpm db:seed
```

### 5. Start services

```bash
# API server (port 3001)
pnpm dev:api

# Background worker
pnpm dev:worker

# Mobile app
pnpm dev:mobile

# Admin console (port 3002)
pnpm dev:admin
```

## Architecture

### Monorepo Structure

```
ignite/
  apps/
    mobile/          # Expo app (iOS, Android, Web)
    admin/           # Next.js admin console
  services/
    api/             # Fastify REST API
    worker/          # BullMQ background jobs
  packages/
    shared/          # Types, Zod schemas, constants
    payments/        # Stripe adapter
    ledger/          # Double-entry accounting
  prisma/
    schema.prisma    # Database schema
  infra/
    docker-compose.yml
```

### Business Rules

**Invite System**
- Registration requires email to be on the allowlist
- Admins add emails to `AllowlistEmail` table

**Geographic Restrictions**
- Allowed states: CA, NY, TX
- GPS check required before: top-up, create match, accept match, withdraw

**Wallet & Ledger**
- Three account types: AVAILABLE, LOCKED, PENDING
- Top-up amounts: $10, $20, $50, $100, $200, $500, $1000
- Stakes: $10 to $1000

**Match Flow**
1. Creator posts challenge (funds locked from AVAILABLE → LOCKED)
2. Accepter accepts (funds locked)
3. Match played
4. Results submitted by both players
5. On agreement: winner credited to PENDING, chess-verify job enqueued
6. After verification: PENDING → AVAILABLE
7. On disagreement: dispute opened, bond locked

**Fees**
- Platform fee: 5% of total pot
- Dispute bond: 10% of total pot

**Handle Rules**
- Unique handles
- Can only be changed once

**Dispute Flow**
1. 10-minute window after winner submission
2. Loser can dispute (bond locked)
3. Admin reviews proofs and resolves
4. Winner gets bond if upheld, loser gets bond back if denied

## API Endpoints

See `docs/API.md` for full API documentation.

## Database

Run `pnpm db:generate` to regenerate Prisma client after schema changes.

## Testing Allowlist Emails

The seed creates these test emails:
- `test1@example.com`
- `test2@example.com`
- `admin@ignite.gg`
