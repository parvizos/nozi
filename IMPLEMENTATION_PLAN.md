# NOZI — implementation plan

## 1. Delivery strategy

Разработка идет вертикальными, проверяемыми increments. P0 завершается только тогда, когда критический order flow работает через PostgreSQL и server-side authorization. P1 начинается после P0 readiness review; P2 исключен из текущего плана.

Каждый phase завершается:

1. реализованным acceptance criteria;
2. `format:check`, `lint`, `typecheck`, relevant unit/integration tests и production build;
3. обновлением документации и `.env.example`, если появились новые требования;
4. проверкой `git status`, отсутствия секретов и понятным git commit;
5. демонстрацией работающего пользовательского пути, когда phase содержит UI.

## 2. Quality gates для всех фаз

- TypeScript strict без необоснованных `any`.
- Zod validation на каждом внешнем input boundary.
- Backend authorization для каждой protected operation.
- Critical writes transaction-safe и idempotent, где возможен повтор.
- Ошибки имеют stable code и request ID; секреты/PII не логируются.
- UI содержит loading, empty, error и success/persistent result states.
- Database migrations применяются с нуля и на предыдущем schema state.
- Новые environment variables описаны, типизированы и не содержат секретных defaults.
- Tests проверяют поведение и границы доступа, а не implementation details.

## 3. Phase 0 — architecture baseline (текущий этап)

### Scope

- Зафиксировать modular monolith, application boundaries и deployment model.
- Зафиксировать PostgreSQL proposal, order state machine, ledger и security model.
- Разбить MVP на phases и acceptance criteria.

### Deliverables

- `ARCHITECTURE.md`;
- `DATABASE_SCHEMA.md`;
- `IMPLEMENTATION_PLAN.md`.

### Exit criteria

- Документы согласованы между собой.
- Нет реализации application до architecture review.
- Принятые ограничения явно указаны: one-store cart, one city at launch, cash/test payment, polling live board.

## 4. Phase 1 — foundation, database и authentication

### Scope

- Инициализировать pnpm/Turborepo monorepo и `apps/web`.
- Настроить Next.js, strict TypeScript, Tailwind, shadcn/ui base, ESLint и formatter.
- Создать packages: config, database, auth, validation, ui, observability.
- Поднять PostgreSQL через Docker Compose для local development.
- Реализовать Prisma schema foundation и initial migrations.
- Реализовать email/password auth, Argon2id и database sessions.
- Реализовать roles, seller memberships, `ActorContext` и authorization helpers.
- Добавить structured logger, request IDs, error envelope, live/ready health endpoints.
- Создать deterministic seed framework и demo users с environment guard.
- Добавить secure headers, CSRF/origin protection и login rate limit.

### Tests

- Fresh migration and seed against PostgreSQL.
- Signup/login/logout/session revocation.
- Suspended user denial.
- Role and seller-scope authorization helpers.
- Environment validation and health endpoint behavior.

### Exit criteria

- Demo users входят под четырьмя ролями.
- Protected route groups и API возвращают корректные 401/403.
- Production build проходит; readiness зависит от database.
- Ни один секрет не попадает в client bundle или repository.

### Suggested commit

`feat: establish monorepo database and authentication foundation`

## 5. Phase 2 — catalog и customer marketplace

### Scope

- Реализовать city, category, seller/store и catalog schema.
- Seller/store onboarding minimum data и admin-created approved fixtures.
- Customer home: city selector, categories, popular stores/products, curated sections.
- Catalog search/filter/sort by category, price, rating, store and delivery estimate.
- Product page with media, variants, availability, store and reviews placeholder/summary.
- S3-compatible storage adapter and signed image upload foundation.
- Mobile-first customer navigation, skeleton/empty/error states.
- Seed: 5 stores, 6 categories, 30–50 realistic products.

### Tests

- Catalog query/filter/sort integration tests.
- Hidden/inactive store/product exclusion.
- Product slug/store tenant uniqueness.
- Signed upload authorization and file constraint tests.
- Core pages render on mobile and desktop viewports.

### Exit criteria

- Anonymous customer can browse only active marketplace data.
- Product detail resolves variant price and availability from database.
- Seller data isolation exists before CRUD is exposed.

### Suggested commit

`feat: add marketplace catalog and product discovery`

## 6. Phase 3 — cart, checkout и order foundation

### Scope

- Реализовать one-store cart and cart items.
- Add/update/remove item flows and persistent customer cart.
- Checkout form: buyer, recipient, address details, notes, date/window, gift message, anonymous option and payment method.
- Server-side price recalculation and order financial snapshots.
- Inventory reservation with concurrency protection.
- Cash/Test payment adapters and provider registry.
- Order creation idempotency.
- Order state machine and append-only status history.
- Customer confirmation, order detail and status timeline.
- Initial transactional outbox and in-app notification records.

### Tests

- Price tampering rejected/recalculated server-side.
- Cross-store cart behavior.
- Concurrent stock reservation and out-of-stock rollback.
- Duplicate checkout idempotency key returns same order.
- Allowed/forbidden transitions by actor.
- Customer cannot access another customer’s order.
- Order/history/payment/commission records commit atomically.

### Exit criteria

- Customer places a real database-backed order.
- Order reaches `AWAITING_SELLER_CONFIRMATION` with consistent timeline.
- Refresh/relogin preserves cart/order state.
- Failed checkout leaves no partial order or inventory corruption.

### Suggested commit

`feat: implement transactional checkout and order engine`

## 7. Phase 4 — seller operations

### Scope

- Complete seller onboarding fields and store settings.
- Dashboard metrics: today orders/sales, average order, products, low stock, cancellations.
- Seller order list/details with filters.
- Accept, reject with reason, start preparation and ready-for-pickup transitions.
- Product CRUD, archive, variants, stock and multi-image management.
- Opening hours, minimum order, preparation time, delivery availability and pause.
- Basic revenue/orders/AOV/top products analytics.

### Tests

- Seller A cannot read/mutate Seller B data via guessed IDs or filters.
- Seller transition permissions and invalid transition rejection.
- Suspended seller/store behavior.
- Product CRUD validation and image ownership.
- Dashboard aggregates match fixture orders.

### Exit criteria

- New customer order appears for the correct seller.
- Seller can accept and progress it to `READY_FOR_PICKUP`.
- Reject flow cancels order with reason and releases inventory.

### Suggested commit

`feat: deliver seller order and catalog operations`

## 8. Phase 5 — admin operations и finance

### Scope

- Admin dashboard: GMV, status counts, sellers/customers/couriers.
- Live Orders Board with polling/refresh and status filters.
- Global order detail, history, internal notes and controlled override.
- Seller approval/rejection/suspension and commission management.
- Product moderation/hide/archive.
- Customer and courier administration.
- Category CRUD/order/enable-disable.
- Commission snapshot and double-entry ledger accounts/transactions/entries.
- Finance view: subtotal, delivery, commission, seller, courier and refund amounts.
- Append-only audit logs for sensitive admin operations.

### Tests

- Admin permission matrix and audit creation.
- Commission changes do not mutate historical order snapshots.
- Ledger debit/credit balance for order, cash capture and cancellation/refund fixtures.
- Override requires permission and reason; impossible transitions remain blocked.
- Dashboard aggregates exclude invalid/terminal categories correctly.

### Exit criteria

- Admin sees every active order and its complete history.
- Seller approval and commission changes are audited.
- Each financially relevant completed order has a balanced ledger transaction.

### Suggested commit

`feat: add admin operations and auditable finance ledger`

## 9. Phase 6 — courier workflow

### Scope

- Courier profile/status and responsive authentication area.
- Available/assigned delivery list, current delivery and history.
- Admin assignment/reassignment with city/status validation.
- Courier accept, arrive, pickup, on-the-way and delivered actions.
- Scope-limited store/recipient/address/contact data.
- Last known latitude/longitude/update fields and optional manual update endpoint.
- Customer/seller/admin status propagation through central state machine.

### Tests

- One active assignment per order.
- Courier cannot view or mutate another courier’s assignment.
- Assignment only from allowed order status and city.
- Duplicate courier transition is idempotent.
- Delivered transition completes inventory/finance/payment policy atomically.
- PII is minimized after assignment completion.

### Exit criteria

- Admin assigns a ready order.
- Assigned courier completes delivery from a phone-sized UI.
- Customer timeline and admin board reflect each committed transition.

### Suggested commit

`feat: implement courier assignment and delivery workflow`

## 10. Phase 7 — notifications, refunds и operational jobs

### Scope

- Worker process and transactional outbox dispatcher.
- In-app notifications and email provider adapter/mock.
- Templates/events for new order, accepted order, courier assignment and delivery.
- Retry/backoff/dead-letter visibility for delivery failures.
- Payment webhook ingestion contract and idempotency.
- Admin refund request and TestProvider refund path.
- Refund status, order update and reversing ledger transaction.
- Cleanup jobs for expired sessions/carts/reservations/idempotency keys/orphan uploads.

### Tests

- Database commit followed by eventual notification delivery.
- Worker retry does not duplicate notification/provider call beyond contract.
- Verified webhook required and provider event processed once.
- Refund cannot exceed capture and creates balanced reversal.
- Job lock prevents concurrent duplicate processing.

### Exit criteria

- Seller/customer/courier receive durable in-app notifications.
- Failed external notification does not roll back order and can be retried.
- Test refund is auditable end-to-end.

### Suggested commit

`feat: add reliable notifications jobs and refund flow`

## 11. Phase 8 — hardening, end-to-end tests и deployment

### Scope

- Complete realistic seed: all required users/products/orders/statuses/ledger.
- API integration and Playwright critical-flow suites.
- Authorization matrix test suite and IDOR probes.
- Rate limits for critical endpoints, CSP/security headers and upload hardening.
- Dockerfile (multi-stage, non-root, standalone Next.js) and production compose/reference.
- GitHub Actions CI for format/lint/typecheck/unit/integration/build/security checks.
- Staging/production migration and rollback instructions.
- Cloudflare DNS/CDN/WAF/R2 integration guide without origin lock-in.
- Structured logs, error provider, metrics hooks and health checks.
- README with installation, env, migration, seed, dev, test, build and deployment.
- Backup/PITR and restore-runbook requirements.

### Required E2E flows

#### Happy path

```text
Customer places order
→ Seller accepts
→ Seller starts preparing
→ Seller marks ready
→ Admin assigns courier
→ Courier accepts/picks up/starts delivery
→ Courier delivers
→ Customer sees complete timeline
→ Admin sees completed finance breakdown and balanced ledger
```

#### Rejection path

```text
Customer places order
→ Seller rejects with reason
→ Order is cancelled
→ Inventory reservation is released
→ Payment/refund policy and ledger remain consistent
→ Customer receives notification
```

### Additional security scenarios

- Customer, seller and courier attempt IDOR against every sensitive resource.
- Frontend role tampering has no effect on backend authorization.
- Concurrent seller/admin/courier transitions produce one valid result.
- Duplicate checkout/payment/refund/webhook requests are safe.
- Suspended seller/user sessions lose access.

### Exit criteria

- CI passes from clean checkout.
- Production image starts as non-root and passes ready health check.
- Both critical E2E flows pass against PostgreSQL with real application services.
- Deployment/rollback/database migration runbooks are executable.
- No P0 known issue can corrupt orders, money, access scope or inventory.

### Suggested commit

`chore: harden test and package NOZI for production deployment`

## 12. P1 после P0 readiness

P1 выполняется отдельными prioritized slices:

- favorites;
- verified reviews;
- richer seller/admin analytics;
- promotions/promo codes;
- additional notification channels;
- curated collections management;
- improved catalog search.

P1 не блокирует запуск, если P0 flow, безопасность и operations готовы.

## 13. Explicitly deferred P2

- Continuous GPS tracking and customer map.
- Loyalty system.
- Recommendation engine/AI.
- Automated seller payouts.
- Native mobile applications.
- Multi-store cart.
- Multi-country tax/legal automation.
- Microservice extraction.

Эти функции не должны появляться в foundation abstractions сверх небольших, обоснованных extension points.

## 14. Milestone review checklist

Для каждого крупного этапа review показывает:

- какие user journeys реально работают;
- какие database migrations добавлены;
- какие RBAC/tenant boundaries покрыты;
- результаты lint/typecheck/tests/build;
- известные ограничения и риск для следующей фазы;
- commit hash и отсутствие незапланированных изменений.

## 15. Definition of MVP done

MVP готов к пилоту в одном городе, когда:

1. Четыре demo/operational роли используют реальную authentication и database.
2. Каталог, cart и checkout работают на мобильном customer UI.
3. Seller обрабатывает только свои заказы и товары.
4. Admin управляет seller approval, orders, courier assignment и finance visibility.
5. Courier видит только назначенные доставки и завершает workflow.
6. Order state machine и history исключают нелогичные переходы.
7. Payment abstraction поддерживает cash/test, refund path и не хранит card data.
8. Ledger дает сбалансированную финансовую историю.
9. Critical E2E и authorization suites проходят в CI.
10. Система deployable из clean checkout, наблюдаема и имеет backup/rollback runbooks.

