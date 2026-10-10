# Phase 7 operations

## Identity

Customer identity is phone-first. Tajik numbers are normalized to `+992XXXXXXXXX` before lookup and the canonical value is unique in `users.phone_e164`. Better Auth remains the session authority; a successful custom OTP verification is handed to its phone plugin, which creates the normal revocable database session.

NOZI does not use Better Auth's built-in OTP persistence. `OtpChallenge` stores an HMAC-SHA-256 code hash, attempt counters, expiry and one-time status. A short-lived AES-256-GCM ciphertext exists only so the asynchronous worker can deliver the code. Plaintext OTP is never stored. The optional API development response requires `NODE_ENV !== production` and `ENABLE_DEV_OTP_RESPONSE=true`.

Courier invitations remain as an internal fallback. The pilot path uses the courier's admin-registered phone: OTP verification activates an invited, non-suspended courier and creates a Better Auth session.

## Transactional outbox

Order state, assignment and OTP transactions insert a deduplicated `OutboxEvent` in the same PostgreSQL transaction. No SMS is sent from a web request or order transaction.

Workers claim ready events with `FOR UPDATE SKIP LOCKED`. Each claim increments `attempts`; failures use capped exponential backoff and become `DEAD_LETTER` after `OUTBOX_MAX_ATTEMPTS`. Provider calls receive a stable idempotency key. `NotificationDeliveryAttempt` records only a recipient hash, provider status and safe error.

Delivery proof codes remain HMAC-derived and hashed in `DeliveryProof`. The outbox contains only AES-GCM ciphertext plus the proof id. Before delivery, the worker verifies that the referenced proof is still current and unexpired. Courier and production admin APIs never expose the code.

## Worker

Run separately from Next.js:

```bash
pnpm --filter @nozi/worker start
```

The worker:

- drains the notification outbox;
- runs `expireStaleOrders()` on the configured interval;
- expires OTP challenges and courier invitations;
- removes old rate-limit buckets, idempotency keys, expired sessions, courier locations and sent outbox records;
- marks old active carts abandoned;
- writes a database heartbeat.

Its HTTP health server exposes `GET /health/live` and `GET /health/ready` on `WORKER_PORT`. Admin notification health is available at `/admin/system` and `/api/v1/admin/system`.

## Network trust and bot protection

`TRUST_PROXY=false` is the safe default. In this mode application code ignores `cf-connecting-ip` and `x-forwarded-for`. Set `TRUST_PROXY=cloudflare` only when the origin is reachable exclusively through Cloudflare; then only `cf-connecting-ip` is trusted.

Without a trusted proxy there is no portable client socket address in the Next.js Web Request API, so IP buckets are not fabricated from forwarded headers. Phone limits, challenge attempt limits and Turnstile still apply. Production should use the documented Cloudflare-only origin topology so both phone and trusted-IP limits are active.

Production OTP requests can require Turnstile with `TURNSTILE_MODE=required` and `TURNSTILE_SECRET_KEY`. Local development can disable it. A production origin must be firewalled so clients cannot bypass the trusted reverse proxy.

## SMS providers

`SMS_PROVIDER` supports:

- `console` for non-production development;
- `mock` for tests;
- `disabled` when SMS is not required;
- `http`, a vendor-neutral HTTPS adapter using bearer authentication and idempotency keys.

When `SMS_REQUIRED=true` in production, configuration fails unless the `http` adapter, URL, key and sender are present. Selecting a real Tajik SMS vendor remains a deployment decision, not domain coupling.

The SMS and email abstractions are channel-neutral. Phase 7 ships SMS adapters and in-app persistence; a concrete email transport is intentionally left unselected until deployment credentials and a provider are approved.

## Acceptance

`pnpm acceptance:phase7` expects a seeded development database plus a running worker. It verifies a complete COD delivery, delivery-code proof, balanced ledger, in-app notifications, automatic stale-order cancellation and dead-letter handling.

## Test isolation

Run database-free checks with `pnpm test:unit`. Run PostgreSQL checks with
`pnpm test:integration`; the guarded runner sets `NODE_ENV=test` and
`ENABLE_TEST_PAYMENTS=true` only for its child processes, applies migrations,
and clears the dedicated `nozi_test_*` database before every suite. Production
and development configuration never inherit these test flags.
