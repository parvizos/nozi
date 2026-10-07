# NOZI — PostgreSQL schema proposal

## 1. Общие соглашения

- PostgreSQL является source of truth; Prisma управляет schema и migrations.
- Primary keys: UUID, генерируемые database/application стандартным криптографическим генератором.
- Время: `timestamptz`, значения в UTC; поля называются `created_at`, `updated_at`, `deleted_at`.
- Деньги: `numeric(12,2)` плюс `currency_code char(3)`. В TypeScript используются Decimal/string, не `number`.
- Статусы и типы с фиксированной семантикой — PostgreSQL/Prisma enums. Часто меняющиеся business labels — tables.
- Soft delete применяется к mutable catalog/identity records. Финансовые, order, status, payment и audit records immutable/retained.
- Все foreign keys имеют явную delete policy. Для истории обычно `RESTRICT`; для чисто зависимых transient records — `CASCADE`.
- `updated_at` обновляется ORM/application layer. Важные invariants дополнительно защищаются database constraints.
- PII не включается в generic JSON metadata.

## 2. Основные enums

```text
UserRole = CUSTOMER | SELLER | COURIER | ADMIN | SUPER_ADMIN
UserStatus = ACTIVE | INVITED | SUSPENDED | DISABLED
SellerStatus = PENDING | APPROVED | REJECTED | SUSPENDED
StoreStatus = DRAFT | ACTIVE | PAUSED | SUSPENDED
ProductStatus = DRAFT | PENDING_REVIEW | ACTIVE | HIDDEN | ARCHIVED
OrderStatus = CREATED | AWAITING_SELLER_CONFIRMATION | CONFIRMED |
              PREPARING | READY_FOR_PICKUP | COURIER_ASSIGNED |
              PICKED_UP | ON_THE_WAY | DELIVERED | CANCELLED | REFUNDED
PaymentMethod = CASH | TEST | ONLINE
PaymentStatus = CREATED | PENDING | AUTHORIZED | CAPTURED | FAILED |
                CANCELLED | PARTIALLY_REFUNDED | REFUNDED
RefundStatus = REQUESTED | PROCESSING | SUCCEEDED | FAILED | CANCELLED
AssignmentStatus = ASSIGNED | ACCEPTED | ARRIVED_AT_STORE | PICKED_UP |
                   ON_THE_WAY | DELIVERED | CANCELLED
NotificationChannel = IN_APP | EMAIL | SMS | WHATSAPP | TELEGRAM
NotificationStatus = PENDING | SENT | FAILED | READ
LedgerDirection = DEBIT | CREDIT
AddressType = CUSTOMER | STORE | ORDER_SNAPSHOT
```

## 3. Identity и access

### `users`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| email | citext/null | unique when non-null |
| phone_e164 | varchar(20)/null | unique when verified |
| display_name | varchar(160) | |
| password_hash | text/null | server-only; null for future external identity |
| status | UserStatus | default ACTIVE |
| email_verified_at | timestamptz/null | |
| phone_verified_at | timestamptz/null | |
| last_login_at | timestamptz/null | |
| created_at, updated_at | timestamptz | |
| deleted_at | timestamptz/null | soft delete |

Indexes/constraints:

- unique `lower(email)` where `deleted_at is null` (or `citext` unique partial index);
- unique `phone_e164` where verified and not deleted;
- index `(status, created_at desc)`.

### `roles`, `user_roles`

`roles(id, code unique, description)` and `user_roles(user_id, role_id, created_at, created_by_user_id)` with composite PK `(user_id, role_id)`. A join table supports multiple roles without trusting a single role string on the user row.

### `auth_sessions`

`id`, `user_id`, `token_hash unique`, `expires_at`, `last_seen_at`, `ip_hash`, `user_agent`, `revoked_at`, timestamps. Raw session token is never stored.

Indexes: `(user_id, revoked_at)`, `(expires_at)` for cleanup.

### `customer_profiles`

`user_id PK/FK`, `first_name`, `last_name`, `locale`, `marketing_consent_at`, timestamps.

### `admin_permissions`

Optional fine-grained permissions: `admin_permissions(id, code unique)` and `user_admin_permissions(user_id, permission_id, granted_by_user_id, created_at)`. Roles grant defaults; sensitive actions check explicit permissions.

## 4. Geography и addresses

### `countries`

`id`, `iso_code char(2) unique`, `name`, `default_currency_code`, `is_active`.

### `cities`

`id`, `country_id`, `name`, `slug`, `timezone`, `currency_code`, `locale`, `is_active`, timestamps. Unique `(country_id, slug)`.

### `addresses`

`id`, `customer_user_id nullable`, `city_id`, `label`, `recipient_name`, `phone_e164`, `line1`, `line2`, `building`, `apartment`, `entrance`, `floor`, `postal_code`, `latitude numeric(9,6)`, `longitude numeric(9,6)`, `delivery_notes`, `is_default`, timestamps, `deleted_at`.

Only reusable customer addresses are stored here. Store addresses have a dedicated one-to-one table; order delivery data is copied into snapshots.

Index `(customer_user_id, deleted_at)`; application/database constraint ensures one default active address per customer.

## 5. Sellers и stores

### `sellers`

`id`, `legal_name`, `public_name`, `status`, `support_email`, `support_phone_e164`, `tax_identifier nullable`, `documents_status`, `default_commission_rate numeric(5,2)`, `approved_at`, `approved_by_user_id`, `rejection_reason`, timestamps, `deleted_at`.

Constraint: commission rate between 0 and 100.

### `seller_users`

`seller_id`, `user_id`, `seller_role` (`OWNER | MANAGER | OPERATOR`), `is_active`, timestamps. Composite unique `(seller_id, user_id)`.

Indexes `(user_id, is_active)` and `(seller_id, is_active)`.

### `stores`

`id`, `seller_id`, `city_id`, `name`, `slug`, `description`, `logo_object_key`, `status`, `phone_e164`, `minimum_order_amount`, `default_preparation_minutes`, `delivery_enabled`, `is_temporarily_paused`, `pause_reason`, `rating_average numeric(3,2)`, `rating_count`, timestamps, `deleted_at`.

Unique `(city_id, slug)` where not deleted. Indexes `(seller_id, status)`, `(city_id, status)`, rating and popular listing indexes.

### `store_addresses`

One-to-one with store: `store_id PK/FK`, `city_id`, address components, latitude/longitude, timestamps.

### `store_opening_hours`

`id`, `store_id`, `weekday smallint`, `opens_at time`, `closes_at time`, `is_closed`, timestamps. Unique `(store_id, weekday, opens_at)`; weekday 1..7 and valid time range constraints. Split shifts use multiple rows.

### `seller_payout_profiles`

Placeholder metadata only: `id`, `seller_id`, `provider`, `external_account_reference`, `status`, timestamps. Bank/card details are never stored directly.

## 6. Catalog

### `categories`

`id`, `parent_id nullable`, `name`, `slug`, `description`, `image_object_key`, `display_order`, `is_enabled`, timestamps, `deleted_at`. Unique active `slug`; index `(parent_id, is_enabled, display_order)`.

### `products`

`id`, `store_id`, `category_id`, `name`, `slug`, `description`, `status`, `base_price`, `compare_at_price nullable`, `currency_code`, `track_inventory`, `moderated_at`, `moderated_by_user_id`, `moderation_note`, `rating_average`, `rating_count`, timestamps, `deleted_at`, `version int`.

Unique `(store_id, slug)` where not deleted. Constraints: nonnegative prices; `compare_at_price > base_price` when present. Indexes for catalog `(category_id, status, created_at)`, `(store_id, status)`, `(status, rating_average)`. PostgreSQL full-text/trigram index may be added for initial search.

### `product_images`

`id`, `product_id`, `object_key`, `alt_text`, `display_order`, `width`, `height`, `mime_type`, `created_at`, `deleted_at`. Unique `(product_id, display_order)` among active rows.

### `product_variants`

`id`, `product_id`, `name`, `sku`, `price_delta`, `absolute_price nullable`, `stock_quantity`, `reserved_quantity`, `is_active`, `display_order`, timestamps, `deleted_at`, `version`.

Unique `(product_id, sku)` where not deleted. Constraints: stock/reserved nonnegative and `reserved_quantity <= stock_quantity` when inventory tracked. At least one default variant is created per product.

Variant attributes use normalized records:

- `product_options(id, product_id, name, display_order)`;
- `product_option_values(id, option_id, value, display_order)`;
- `variant_option_values(variant_id, option_value_id)`.

This avoids placing arbitrary sellable variant structure into JSON.

## 7. Customer engagement

### `favorites`

`customer_user_id`, `product_id`, `created_at`; composite PK prevents duplicates. Index by product for aggregate counts.

### `reviews`

`id`, `order_item_id`, `customer_user_id`, `product_id`, `store_id`, `rating smallint`, `comment`, `status`, timestamps, `deleted_at`. Unique `order_item_id`; rating 1..5. Only delivered order item owners may review.

## 8. Cart

### `carts`

`id`, `customer_user_id`, `store_id`, `currency_code`, `status` (`ACTIVE | CONVERTED | ABANDONED`), `expires_at`, timestamps, `version`.

Partial unique: one active cart per customer. `store_id` enforces the one-store cart policy.

### `cart_items`

`id`, `cart_id`, `product_variant_id`, `quantity`, `customer_note nullable`, timestamps. Unique `(cart_id, product_variant_id)`; quantity > 0.

Cart prices are previews and are always recalculated at checkout. No authoritative total is stored in cart.

## 9. Orders

### `orders`

| Group | Columns |
| --- | --- |
| Identity | `id`, human-readable `order_number unique`, `customer_user_id`, `store_id`, `city_id` |
| Lifecycle | `status`, `version`, `placed_at`, `confirmed_at`, `delivered_at`, `cancelled_at`, `cancellation_reason_code`, `cancellation_note` |
| Schedule | `delivery_date_local`, `delivery_window_start_local`, `delivery_window_end_local`, `delivery_timezone` |
| Recipient | `buyer_name`, `buyer_phone_e164`, `recipient_name`, `recipient_phone_e164`, `gift_message`, `anonymous_delivery`, `delivery_notes` |
| Money | `currency_code`, `subtotal_amount`, `discount_amount`, `delivery_fee_amount`, `total_amount`, `commission_amount`, `seller_amount`, `courier_amount`, `refunded_amount` |
| Other | `payment_method`, `customer_comment`, timestamps |

All amounts are nonnegative; total invariant is checked in application and database where expressible. Indexes:

- `(customer_user_id, created_at desc)`;
- `(store_id, status, created_at desc)`;
- `(status, created_at desc)` for live board;
- `(city_id, delivery_date_local, status)`;
- unique `order_number`.

Orders are never soft-deleted.

### `order_delivery_addresses`

Immutable one-to-one snapshot: `order_id PK/FK`, `city_name`, `country_code`, `line1`, `line2`, `building`, `apartment`, `entrance`, `floor`, `postal_code`, `latitude`, `longitude`, `created_at`.

The snapshot remains valid when a customer edits or deletes a saved address.

### `order_items`

`id`, `order_id`, `product_id nullable`, `product_variant_id nullable`, snapshot fields (`product_name`, `variant_name`, `sku`, `image_object_key`), `unit_price`, `quantity`, `line_subtotal`, `discount_amount`, `line_total`, `currency_code`, timestamps.

FKs to catalog use `SET NULL` only if archival retention policy later allows physical deletion; snapshot fields remain authoritative. Quantity > 0 and amount constraints apply.

### `inventory_reservations`

`id`, `order_id`, `product_variant_id`, `quantity`, `status` (`ACTIVE | RELEASED | CONSUMED`), `expires_at`, timestamps. Unique active reservation per `(order_id, variant_id)`. Inventory changes and reservation records share the checkout transaction.

### `order_status_history`

`id`, `order_id`, `previous_status nullable`, `new_status`, `changed_by_user_id nullable`, `actor_type`, `note nullable`, `source` (`UI | API | SYSTEM | WEBHOOK`), `created_at`.

Indexes `(order_id, created_at, id)` and `(new_status, created_at)`. Rows are append-only. `changed_by_user_id` can be null only for explicit system events.

### `admin_notes`

`id`, `order_id nullable`, `seller_id nullable`, `customer_user_id nullable`, `author_user_id`, `body`, `created_at`, `updated_at`, `deleted_at`. Constraint requires exactly one supported subject. Notes are never exposed outside admin APIs.

## 10. Courier и delivery

### `couriers`

`id`, `user_id unique`, `city_id`, `status` (`ACTIVE | INACTIVE | SUSPENDED`), `vehicle_type`, `courier_latitude numeric(9,6) nullable`, `courier_longitude numeric(9,6) nullable`, `location_updated_at`, timestamps.

Index `(city_id, status)`; latitude/longitude must both be null or both present and within valid ranges.

### `courier_assignments`

`id`, `order_id`, `courier_id`, `assigned_by_user_id`, `status`, `accepted_at`, `arrived_at_store_at`, `picked_up_at`, `on_the_way_at`, `delivered_at`, `cancelled_at`, `cancellation_reason`, timestamps, `version`.

Partial unique: one non-terminal assignment per order. Indexes `(courier_id, status, created_at desc)` and `(order_id, created_at desc)`.

Assignment events can be reconstructed from timestamp columns for MVP; status mutations also produce order status history and audit/outbox records. A future `courier_location_history` append-only table can support continuous tracking.

## 11. Payments и refunds

### `payments`

`id`, `order_id`, `provider`, `method`, `status`, `amount`, `currency_code`, `provider_reference nullable`, `idempotency_key`, `failure_code`, `failure_message_safe`, `authorized_at`, `captured_at`, timestamps.

Unique `(provider, provider_reference)` when non-null; unique `(order_id, idempotency_key)`. Index `(order_id, created_at)`.

### `payment_events`

`id`, `payment_id`, `provider`, `provider_event_id`, `event_type`, `payload_encrypted_or_redacted`, `processed_at`, `processing_error`, `created_at`. Unique `(provider, provider_event_id)` gives webhook idempotency. Raw secrets/card data are prohibited.

### `refunds`

`id`, `payment_id`, `order_id`, `status`, `amount`, `currency_code`, `reason_code`, `reason_note`, `requested_by_user_id`, `provider_reference`, `idempotency_key`, timestamps.

Unique `(payment_id, idempotency_key)`; sum of successful refunds cannot exceed captured amount, enforced transactionally.

### `commissions`

`id`, `order_id unique`, `seller_id`, `rate numeric(5,2)`, `basis_amount`, `commission_amount`, `currency_code`, `policy_version`, `created_at`.

This immutable snapshot prevents later seller rate changes from altering old orders.

## 12. Double-entry ledger

### `ledger_accounts`

`id`, `owner_type` (`PLATFORM | SELLER | COURIER | EXTERNAL`), `owner_id nullable`, `account_type`, `currency_code`, `name`, `created_at`, `closed_at`.

Unique active `(owner_type, owner_id, account_type, currency_code)`.

### `ledger_transactions`

`id`, `reference_type`, `reference_id`, `event_type`, `currency_code`, `description`, `effective_at`, `created_by_user_id nullable`, `reverses_transaction_id nullable`, `created_at`.

Unique `(reference_type, reference_id, event_type)` where event semantics require idempotency. Transactions are immutable.

### `ledger_entries`

`id`, `ledger_transaction_id`, `ledger_account_id`, `direction`, `amount numeric(12,2)`, `created_at`. Amount > 0. Index `(ledger_account_id, created_at)`.

Application posts all lines atomically and asserts debit total equals credit total for one currency. A deferred constraint trigger may add database-level enforcement after the schema foundation is stable. Reversals create new transactions.

## 13. Notifications и outbox

### `notifications`

`id`, `recipient_user_id`, `type`, `title`, `body`, `action_url nullable`, `status`, `read_at`, `created_at`. Index `(recipient_user_id, read_at, created_at desc)`.

### `notification_deliveries`

`id`, `notification_id`, `channel`, `provider`, `status`, `attempt_count`, `next_attempt_at`, `provider_reference`, `last_error_safe`, timestamps. Unique `(notification_id, channel)` for single delivery per channel unless policy explicitly versions attempts.

### `outbox_events`

`id`, `aggregate_type`, `aggregate_id`, `event_type`, `payload jsonb`, `occurred_at`, `available_at`, `processed_at`, `attempt_count`, `last_error_safe`.

JSON is appropriate here because payload is a versioned integration event, not the canonical business model. Index `(processed_at, available_at)` and `(aggregate_type, aggregate_id)`.

## 14. Audit, idempotency и abuse protection

### `audit_logs`

`id`, `actor_user_id nullable`, `actor_role`, `action`, `subject_type`, `subject_id`, `request_id`, `ip_hash`, `reason nullable`, `before_redacted jsonb nullable`, `after_redacted jsonb nullable`, `created_at`.

Append-only. JSON snapshots contain only allowlisted non-secret fields. Indexes `(subject_type, subject_id, created_at)` and `(actor_user_id, created_at)`.

### `idempotency_keys`

`id`, `scope`, `actor_user_id`, `key`, `request_hash`, `response_status`, `response_body_redacted`, `resource_type`, `resource_id`, `expires_at`, timestamps. Unique `(scope, actor_user_id, key)`.

### `rate_limit_buckets`

`key_hash`, `bucket_start`, `count`, `expires_at`; composite PK `(key_hash, bucket_start)`. This supports MVP/database limiter and can be replaced by a Redis-compatible adapter.

## 15. Critical transaction boundaries

### Place order

One database transaction:

1. Lock/conditionally update cart and variants.
2. Validate inventory and reserve quantities.
3. Create order, address snapshot and order item snapshots.
4. Create payment and commission snapshot.
5. Create initial status history rows.
6. Create pending ledger/outbox records.
7. Mark cart converted.

External provider call is coordinated through a payment intent/idempotent saga; a network call is not kept inside a long database transaction.

### Transition order

One transaction updates order/version, appends status history, updates related assignment/payment fields when required, and inserts outbox/audit records.

### Assign courier

One transaction locks order, verifies status/city, closes/rejects prior active assignment if authorized, creates the new assignment, transitions order and sends outbox notification.

### Refund

Provider refund is an idempotent multi-step operation. The database records requested/processing first; verified provider success atomically updates refund/payment/order aggregates and posts reversing ledger transaction.

## 16. Seed dataset

Development seed is deterministic and idempotent:

- 1 country and 1 active city with timezone/currency;
- 6 categories;
- 5 stores across 3 seller organizations;
- 30–50 products with variants and image placeholders;
- 3 seller users, 3 couriers, 10 customers and 1 admin;
- 15–20 orders across lifecycle statuses, each with coherent history;
- payment, commission and balanced ledger examples;
- favorites, reviews and notifications where status permits.

Demo login emails and passwords are documented in development README and generated only when `ALLOW_DEMO_SEED=true` outside production. Seed refuses to create known demo passwords when `NODE_ENV=production`.

## 17. Migration policy

- Every schema change is a reviewed migration committed with Prisma schema.
- Production deploy runs migrations as a distinct release step, once.
- Migrations must be backward-compatible with the previous application release.
- Large data backfills run separately with progress and retry.
- Dropping/renaming columns follows expand/migrate/contract across releases.
- Seed is never an implicit production migration.
- CI creates a blank PostgreSQL database, applies all migrations, seeds test fixtures and runs integration tests.

## 18. Invariants requiring tests and/or constraints

1. Seller cannot read/update products or orders from another seller.
2. Customer/courier cannot access another actor’s scoped resources.
3. Current order status equals the latest committed history status.
4. Illegal transition is rejected without partial writes.
5. One active courier assignment per order.
6. Successful refund total never exceeds captured payment.
7. Ledger transaction debits equal credits in the same currency.
8. `order.total = subtotal - discount + delivery_fee` under the active pricing policy.
9. Inventory cannot become negative and reservations cannot exceed stock.
10. Historical item/address/commission snapshots do not change with catalog/profile edits.

