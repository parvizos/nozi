# NOZI

NOZI is a production-minded gift marketplace MVP. The repository currently contains the platform foundation, customer marketplace, transactional purchase flow, and Phase 4 seller workspace: a Next.js modular monolith, PostgreSQL/Prisma, database-backed authentication, RBAC, searchable catalog, server-side cart, checkout, seller order operations, product and stock management, store settings, audit logs, health endpoints and structured logging.

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

The seed always creates roles and admin permission definitions. With `ALLOW_DEMO_SEED=true`, it also creates demo accounts and an idempotent Dushanbe marketplace dataset with 5 stores, 6 categories, 48 products, seller memberships and orders in the incoming, confirmed, preparing and ready states. The seed refuses demo mode in production.

Money uses PostgreSQL `numeric(12,2)` and Prisma `Decimal`. The marketplace data-access layer serializes amounts as decimal strings; application code must not calculate money with JavaScript floating-point numbers.

Each customer has at most one active cart, and every cart belongs to one store. Checkout recalculates current product and variant prices inside a serializable database transaction. It atomically reserves inventory, creates immutable order and delivery snapshots, records both initial status changes, creates the payment record, and converts the cart. `Idempotency-Key` is required on order creation and is unique per customer and checkout scope.

Development-only demo accounts:

| Role                | Email                        |
| ------------------- | ---------------------------- |
| Admin               | `admin@nozi.local`           |
| Seller owner        | `seller@nozi.local`          |
| Seller manager      | `seller.manager@nozi.local`  |
| Seller operator     | `seller.operator@nozi.local` |
| Second seller owner | `seller.atlas@nozi.local`    |
| Courier             | `courier@nozi.local`         |
| Customer            | `customer@nozi.local`        |

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
packages/marketplace        catalog, cart, checkout, orders, seller services and state machine
packages/observability      structured logging and request context
```

The admin and courier interfaces are intentionally deferred to their implementation phases.

## Seller routes

| Route                          | Purpose                                      |
| ------------------------------ | -------------------------------------------- |
| `/seller`                      | Operational metrics and recent orders        |
| `/seller/orders`               | Scoped, filtered and paginated order queue   |
| `/seller/orders/[orderNumber]` | Fulfilment details, timeline and actions     |
| `/seller/products`             | Products, physical stock and reservations    |
| `/seller/products/new`         | Create a product and variants                |
| `/seller/products/[productId]` | Edit, activate or deactivate a product       |
| `/seller/store`                | Public profile, schedule and store operation |
| `/seller/settings`             | Redirect to store settings                   |

Seller entity permissions are enforced on the server. Owners and managers can manage orders, products and store settings; operators can only view and process orders.

## Customer routes

| Route                          | Purpose                                             |
| ------------------------------ | --------------------------------------------------- |
| `/`                            | Database-backed marketplace home                    |
| `/catalog`                     | Paginated catalog with database filters and sorting |
| `/category/[slug]`             | Category landing and filtered products              |
| `/store/[slug]`                | Store profile and product catalog                   |
| `/product/[slug]`              | Product media, variants, availability and favorites |
| `/search`                      | PostgreSQL-backed product and store search          |
| `/cart`                        | Server-side cart and quantity management            |
| `/checkout`                    | Validated delivery, gift and payment details        |
| `/order/[orderNumber]/success` | Order confirmation                                  |
| `/orders/[orderNumber]`        | Customer-owned order status and timeline            |
| `/account/orders`              | Customer order history                              |
| `/sign-in`                     | Customer sign-in for protected actions              |

## Customer API

| Method   | Route                         | Purpose                       |
| -------- | ----------------------------- | ----------------------------- |
| `GET`    | `/api/v1/cart`                | Read the authenticated cart   |
| `DELETE` | `/api/v1/cart`                | Clear the authenticated cart  |
| `POST`   | `/api/v1/cart/items`          | Add a trusted product/variant |
| `PATCH`  | `/api/v1/cart/items/[itemId]` | Change item quantity          |
| `DELETE` | `/api/v1/cart/items/[itemId]` | Remove an item                |
| `POST`   | `/api/v1/checkout/orders`     | Create an idempotent order    |

The checkout endpoint accepts `CASH` and development `TEST` payment methods through the payment provider interface. It never receives or stores card data. Seller rejection releases active inventory reservations once and cancels cash payments or refunds development test payments. Admin and courier workflows remain deferred to their implementation phases.
