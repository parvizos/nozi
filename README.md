# NOZI

NOZI is a production-minded gift marketplace MVP. The repository currently contains the Phase 1 platform foundation and the Phase 2 customer marketplace: a Next.js modular monolith, PostgreSQL/Prisma, database-backed authentication, RBAC, searchable catalog, store and product pages, customer favorites, health endpoints and structured logging.

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

The seed always creates roles and admin permission definitions. With `ALLOW_DEMO_SEED=true`, it also creates demo accounts and an idempotent Dushanbe marketplace dataset with 5 stores, 6 categories and 48 products. The seed refuses demo mode in production.

Catalog money uses PostgreSQL `numeric(12,2)` and Prisma `Decimal`. The marketplace data-access layer serializes amounts as decimal strings; application code must not calculate money with JavaScript floating-point numbers.

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
packages/marketplace        catalog queries, search, favorites and seller scope
packages/observability      structured logging and request context
```

The seller, admin and courier product interfaces are intentionally deferred to their implementation phases.

## Customer routes

| Route              | Purpose                                             |
| ------------------ | --------------------------------------------------- |
| `/`                | Database-backed marketplace home                    |
| `/catalog`         | Paginated catalog with database filters and sorting |
| `/category/[slug]` | Category landing and filtered products              |
| `/store/[slug]`    | Store profile and product catalog                   |
| `/product/[slug]`  | Product media, variants, availability and favorites |
| `/search`          | PostgreSQL-backed product and store search          |
| `/sign-in`         | Customer sign-in for protected actions              |

Checkout, cart state and order creation are intentionally deferred to Phase 3. The product page communicates this and does not create browser-only cart state.
