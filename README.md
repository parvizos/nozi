# NOZI

NOZI is a production-minded gift marketplace MVP. The repository contains a Next.js modular monolith, PostgreSQL/Prisma, phone-first identity, database sessions, granular RBAC, the customer marketplace, transactional purchase flow, seller/admin/courier workspaces, finance ledger, transactional notification outbox, a separate background worker, health endpoints and structured logging.

See [ARCHITECTURE.md](./ARCHITECTURE.md), [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md), [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) and [Phase 7 operations](./docs/PHASE_7_OPERATIONS.md) for the accepted design, delivery plan and worker/identity deployment notes.

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
# In a second process:
pnpm --filter @nozi/worker dev
```

Replace `AUTH_SECRET` and `DEMO_USER_PASSWORD` in the local `.env`. Do not commit `.env` files.

The web service starts at `http://localhost:3000`. Its readiness is available at `/api/v1/health/ready`; liveness is available at `/api/v1/health/live`. The separate worker defaults to port `3001` and exposes `/health/ready` and `/health/live`.

## Database

```bash
pnpm db:migrate       # create/apply a development migration
pnpm db:migrate:deploy
pnpm db:seed
pnpm db:studio
```

The seed always creates roles and admin permission definitions. With `ALLOW_DEMO_SEED=true`, it also creates demo accounts and an idempotent Dushanbe marketplace dataset with 5 stores, 6 categories, 48 products, seller memberships, 3 couriers, active and historical courier assignments, orders in operational states, ledger entries, an internal note and audit history. The seed refuses demo mode in production.

Money uses PostgreSQL `numeric(12,2)` and Prisma `Decimal`. The marketplace data-access layer serializes amounts as decimal strings; application code must not calculate money with JavaScript floating-point numbers.

Each customer has at most one active cart, and every cart belongs to one store. Checkout recalculates current product and variant prices inside a serializable database transaction. It atomically reserves inventory, creates immutable order and delivery snapshots, records both initial status changes, creates the payment record, and converts the cart. `Idempotency-Key` is required on order creation and is unique per customer and checkout scope.

Development-only demo accounts:

| Role                | Email                                                |
| ------------------- | ---------------------------------------------------- |
| Operations admin    | `admin@nozi.local`                                   |
| Support admin       | `admin.support@nozi.local`                           |
| Catalog admin       | `admin.catalog@nozi.local`                           |
| Finance admin       | `admin.finance@nozi.local`                           |
| Super admin         | `superadmin@nozi.local`                              |
| Seller owner        | `seller@nozi.local`                                  |
| Seller manager      | `seller.manager@nozi.local`                          |
| Seller operator     | `seller.operator@nozi.local`                         |
| Second seller owner | `seller.atlas@nozi.local`                            |
| Courier             | `courier@nozi.local`                                 |
| Additional couriers | `courier.two@nozi.local`, `courier.three@nozi.local` |
| Customer            | `customer@nozi.local`                                |

All demo accounts use the local value of `DEMO_USER_PASSWORD`; no password is stored in this repository.

## Quality checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test:unit` is fast and never connects to PostgreSQL. `pnpm test:integration`
uses `TEST_DATABASE_URL` or the documented local default
`postgresql://nozi:nozi_dev_only@127.0.0.1:5432/nozi_test_local`; it applies
migrations and resets only that guarded database before the suite. Create it
once with `docker exec nozi-postgres-1 createdb -U nozi nozi_test_local`.
The runner explicitly enables TEST payments only inside the test process.
It rejects non-loopback hosts, the development/system databases, a database
without the `nozi_test_` prefix, and any mismatch between `DATABASE_URL` and
`TEST_DATABASE_URL`. `pnpm test` runs unit then integration tests.

## Monorepo

```text
apps/web                    Next.js UI and REST API
apps/worker                 outbox, scheduled maintenance and health process
packages/auth               Better Auth, Argon2id and RBAC policies
packages/config             typed environment validation
packages/database           Prisma schema, migrations and seed
packages/marketplace        catalog, checkout, seller/admin/courier services, ledger and state machine
packages/notifications      typed templates, providers, outbox and in-app notifications
packages/observability      structured logging and request context
```

Native mobile applications and continuous GPS streaming remain deferred. The responsive courier workspace uses manual/optional location snapshots and works in the browser.

## Courier routes

| Route                               | Purpose                                      |
| ----------------------------------- | -------------------------------------------- |
| `/courier`                          | Active delivery, queue and daily completion  |
| `/courier/deliveries`               | Paginated active assignments                 |
| `/courier/deliveries/[orderNumber]` | Fulfilment details, contacts and next action |
| `/courier/history`                  | Paginated delivered/cancelled history        |
| `/courier/profile`                  | Courier and operational status               |

Courier APIs are under `/api/v1/courier`. Mutations support accept, arrival, pickup, start, delivery completion, failure reporting and manual location snapshots. Assignment ownership is resolved only from the authenticated courier profile. Delivery completion uses one serializable transaction to consume inventory reservations, update order/assignment/payment, post the CASH collection ledger transaction and return the courier to `AVAILABLE`.

## Admin routes

| Route                         | Purpose                                         |
| ----------------------------- | ----------------------------------------------- |
| `/admin`                      | Platform metrics and operational alerts         |
| `/admin/orders`               | Polling live board, filters and pagination      |
| `/admin/orders/[orderNumber]` | Full order, timeline, notes and allowed actions |
| `/admin/sellers`              | Seller search and moderation                    |
| `/admin/sellers/[sellerId]`   | Seller status, stores and performance           |
| `/admin/stores/[storeId]`     | Store controls and seller commission            |
| `/admin/products`             | Product moderation                              |
| `/admin/customers`            | Customer search and status                      |
| `/admin/customers/[userId]`   | Customer profile and order history              |
| `/admin/couriers`             | Courier creation, status and active work        |
| `/admin/categories`           | Category creation, hierarchy and activation     |
| `/admin/finance`              | GMV, settlement components, payments and ledger |
| `/admin/audit`                | Filtered mutation audit trail                   |
| `/admin/system`               | Outbox backlog and worker heartbeat             |

Admin mutations are authorized by explicit permission codes in addition to the admin role. Order changes use the centralized state machine. Courier assignment and reassignment use serializable transactions plus a partial unique database index that permits only one active assignment per order.

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
| `/account/security`            | Verified identity and logout                        |
| `/notifications`               | User-scoped in-app notifications                    |
| `/sign-in`                     | Phone OTP or internal email sign-in                 |
| `/sign-up`                     | Phone-first customer registration                   |
| `/verify`                      | One-time-code verification                          |

## Customer API

| Method   | Route                         | Purpose                       |
| -------- | ----------------------------- | ----------------------------- |
| `GET`    | `/api/v1/cart`                | Read the authenticated cart   |
| `DELETE` | `/api/v1/cart`                | Clear the authenticated cart  |
| `POST`   | `/api/v1/cart/items`          | Add a trusted product/variant |
| `PATCH`  | `/api/v1/cart/items/[itemId]` | Change item quantity          |
| `DELETE` | `/api/v1/cart/items/[itemId]` | Remove an item                |
| `POST`   | `/api/v1/checkout/orders`     | Create an idempotent order    |

The checkout endpoint accepts `CASH` and explicitly enabled non-production `TEST` payments through the payment provider interface. It never receives or stores card data. Seller rejection releases active inventory reservations once and cancels cash payments or refunds development test payments. Order and assignment changes enqueue typed notification events in their domain transaction; the worker delivers them asynchronously with retry and dead-letter handling.
