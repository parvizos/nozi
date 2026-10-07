# NOZI

NOZI is a production-minded gift marketplace MVP. The repository currently contains the Phase 1 foundation: a Next.js modular monolith, PostgreSQL/Prisma, database-backed authentication, RBAC, health endpoints and structured logging.

See [ARCHITECTURE.md](./ARCHITECTURE.md), [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) and [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for the accepted design and delivery plan.

## Requirements

- Node.js 22 or newer
- pnpm 11
- Docker with Compose, or a PostgreSQL 15+ instance

## Local setup

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

Replace `AUTH_SECRET` and `DEMO_USER_PASSWORD` in the local `.env`. Do not commit `.env` files.

The service starts at `http://localhost:3000`. Readiness is available at `/api/v1/health/ready`; liveness is available at `/api/v1/health/live`.

## Database

```bash
pnpm db:migrate       # create/apply a development migration
pnpm db:migrate:deploy
pnpm db:seed
pnpm db:studio
```

The seed always creates roles and admin permission definitions. Demo accounts are created only when `ALLOW_DEMO_SEED=true`. The seed refuses demo mode in production.

Development-only demo accounts:

| Role     | Email                 |
| -------- | --------------------- |
| Admin    | `admin@nozi.local`    |
| Seller   | `seller@nozi.local`   |
| Courier  | `courier@nozi.local`  |
| Customer | `customer@nozi.local` |

All demo accounts use the local value of `DEMO_USER_PASSWORD`; no password is stored in this repository.

## Quality checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Integration checks require PostgreSQL and the environment variables shown in `.env.example`.

## Monorepo

```text
apps/web                    Next.js UI and REST API
packages/auth               Better Auth, Argon2id and RBAC policies
packages/config             typed environment validation
packages/database           Prisma schema, migrations and seed
packages/observability      structured logging and request context
```

The seller, admin and courier product interfaces are intentionally deferred to their implementation phases.
