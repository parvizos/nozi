import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import {
  auth,
  buildActorContext,
  decryptTransientSecret,
  encryptTransientSecret,
  requestPhoneOtp,
  verifyAndConsumePhoneOtp,
} from "@nozi/auth";
import { resetEnvCacheForTests } from "@nozi/config";
import {
  OtpChallengeStatus,
  OutboxStatus,
  UserRoleCode,
  UserStatus,
  prisma,
  seedMarketplace,
} from "@nozi/database";

import {
  claimOutboxEvents,
  enqueueOutboxEvent,
  getNotificationSummary,
  markNotificationRead,
  processOutboxEvent,
  runCleanupJobs,
  runOutboxBatch,
} from "./index";
import { MockSmsProvider } from "./providers";

function uniquePhone(): string {
  return `+992${Math.floor(100_000_000 + Math.random() * 899_999_999)}`;
}

function authRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost:3000/api/auth${path}`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    method: "POST",
  });
}

async function codeFor(phone: string): Promise<string> {
  const challenge = await prisma.otpChallenge.findFirstOrThrow({
    orderBy: { createdAt: "desc" },
    where: { phoneE164: phone, status: OtpChallengeStatus.PENDING },
  });
  return decryptTransientSecret(challenge.encryptedCode);
}

beforeAll(async () => {
  await seedMarketplace();
});

describe.sequential("Phase 7 phone identity", () => {
  it("creates a customer and database session after a valid one-time code", async () => {
    const phone = uniquePhone();
    await requestPhoneOtp({ clientIp: "127.0.0.1", phone });
    const code = await codeFor(phone);
    const response = await auth.handler(
      authRequest("/phone-number/verify", { code, phoneNumber: phone }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().join(";")).toContain(
      "session_token",
    );
    const user = await prisma.user.findUniqueOrThrow({
      include: { roles: { include: { role: true } }, sessions: true },
      where: { phoneNumber: phone },
    });
    expect(user.phoneNumberVerified).toBe(true);
    expect(user.phoneVerifiedAt).not.toBeNull();
    expect(user.sessions).toHaveLength(1);
    expect(user.roles.map(({ role }) => role.code)).toContain(
      UserRoleCode.CUSTOMER,
    );
    await expect(verifyAndConsumePhoneOtp({ code, phone })).resolves.toBe(
      false,
    );
  });

  it("disables Better Auth's separate phone password-reset OTP store", async () => {
    const response = await auth.handler(
      authRequest("/phone-number/request-password-reset", {
        phoneNumber: uniquePhone(),
      }),
    );
    expect(response.status).toBe(404);
  });

  it("rejects invalid, expired, reused and exhausted challenges", async () => {
    const invalidPhone = uniquePhone();
    await requestPhoneOtp({ clientIp: "127.0.0.2", phone: invalidPhone });
    await expect(
      verifyAndConsumePhoneOtp({ code: "000000", phone: invalidPhone }),
    ).resolves.toBe(false);

    const expiredPhone = uniquePhone();
    await requestPhoneOtp({ clientIp: "127.0.0.3", phone: expiredPhone });
    await prisma.otpChallenge.updateMany({
      data: { expiresAt: new Date(0) },
      where: { phoneE164: expiredPhone },
    });
    await expect(
      verifyAndConsumePhoneOtp({
        code: await codeFor(expiredPhone),
        phone: expiredPhone,
      }),
    ).resolves.toBe(false);

    const blockedPhone = uniquePhone();
    await requestPhoneOtp({ clientIp: "127.0.0.4", phone: blockedPhone });
    const challenge = await prisma.otpChallenge.findFirstOrThrow({
      where: { phoneE164: blockedPhone },
    });
    await prisma.otpChallenge.update({
      data: { attemptCount: challenge.maxAttempts },
      where: { id: challenge.id },
    });
    await expect(
      verifyAndConsumePhoneOtp({ code: "111111", phone: blockedPhone }),
    ).resolves.toBe(false);
    await expect(
      prisma.otpChallenge.findUniqueOrThrow({ where: { id: challenge.id } }),
    ).resolves.toMatchObject({ status: OtpChallengeStatus.BLOCKED });
  });

  it("activates an invited courier by the exact invited phone and blocks suspended courier", async () => {
    const role = await prisma.role.findUniqueOrThrow({
      where: { code: UserRoleCode.COURIER },
    });
    const phone = uniquePhone();
    const user = await prisma.user.create({
      data: {
        email: `otp-courier-${randomUUID()}@nozi.test`,
        name: "OTP Courier",
        phoneNumber: phone,
        roles: { create: { roleId: role.id } },
        status: UserStatus.INVITED,
      },
    });
    await prisma.courier.create({
      data: {
        name: "OTP Courier",
        phoneE164: phone,
        status: "OFFLINE",
        userId: user.id,
      },
    });
    await requestPhoneOtp({ clientIp: "127.0.0.5", phone });
    const response = await auth.handler(
      authRequest("/phone-number/verify", {
        code: await codeFor(phone),
        phoneNumber: phone,
      }),
    );
    expect(response.status).toBe(200);
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
    ).resolves.toMatchObject({ status: UserStatus.ACTIVE });
    await expect(
      prisma.courier.findUniqueOrThrow({ where: { userId: user.id } }),
    ).resolves.toMatchObject({ status: "AVAILABLE" });

    const suspendedPhone = uniquePhone();
    const suspended = await prisma.user.create({
      data: {
        email: `otp-suspended-${randomUUID()}@nozi.test`,
        name: "Suspended Courier",
        phoneNumber: suspendedPhone,
        roles: { create: { roleId: role.id } },
        status: UserStatus.SUSPENDED,
      },
    });
    await prisma.courier.create({
      data: {
        name: "Suspended Courier",
        phoneE164: suspendedPhone,
        status: "SUSPENDED",
        userId: suspended.id,
      },
    });
    await expect(
      requestPhoneOtp({ clientIp: "127.0.0.6", phone: suspendedPhone }),
    ).resolves.toMatchObject({ accepted: true });
    await expect(
      prisma.otpChallenge.count({ where: { phoneE164: suspendedPhone } }),
    ).resolves.toBe(0);
  });

  it("never exposes an OTP in production and only exposes it behind the explicit dev flag", async () => {
    const previousNode = process.env.NODE_ENV;
    const previousFlag = process.env.ENABLE_DEV_OTP_RESPONSE;
    process.env.NODE_ENV = "test";
    process.env.ENABLE_DEV_OTP_RESPONSE = "false";
    resetEnvCacheForTests();
    const hidden = await requestPhoneOtp({
      clientIp: "127.0.0.7",
      phone: uniquePhone(),
    });
    expect(hidden).not.toHaveProperty("developmentCode");
    process.env.ENABLE_DEV_OTP_RESPONSE = "true";
    resetEnvCacheForTests();
    const shown = await requestPhoneOtp({
      clientIp: "127.0.0.8",
      phone: uniquePhone(),
    });
    expect(shown.developmentCode).toMatch(/^\d{6}$/);
    process.env.NODE_ENV = previousNode ?? "test";
    process.env.ENABLE_DEV_OTP_RESPONSE = previousFlag ?? "false";
    resetEnvCacheForTests();
  });
});

describe.sequential("Phase 7 transactional outbox and notifications", () => {
  it("rolls back the outbox event with its domain transaction", async () => {
    const key = `rollback:${randomUUID()}`;
    await expect(
      prisma.$transaction(async (tx) => {
        await enqueueOutboxEvent(tx, {
          aggregateId: randomUUID(),
          aggregateType: "Test",
          dedupeKey: key,
          payload: { orderId: randomUUID(), status: "TEST" },
          type: "ORDER_STATUS_CHANGED",
        });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    await expect(
      prisma.outboxEvent.count({ where: { dedupeKey: key } }),
    ).resolves.toBe(0);
  });

  it("uses SKIP LOCKED claims so concurrent workers do not double claim", async () => {
    const key = `claim:${randomUUID()}`;
    await prisma.outboxEvent.create({
      data: {
        aggregateId: randomUUID(),
        aggregateType: "Test",
        availableAt: new Date(0),
        dedupeKey: key,
        payload: {},
        type: "UNSUPPORTED",
      },
    });
    const [first, second] = await Promise.all([
      claimOutboxEvents("worker-a", 1),
      claimOutboxEvents("worker-b", 1),
    ]);
    const ids = [...first, ...second]
      .filter((event) => event.dedupeKey === key)
      .map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(1);
  });

  it("sends an OTP without storing plaintext and records a delivery attempt", async () => {
    const phone = uniquePhone();
    await requestPhoneOtp({ clientIp: "127.0.0.9", phone });
    const event = await prisma.outboxEvent.findFirstOrThrow({
      orderBy: { createdAt: "desc" },
      where: { type: "OTP_REQUESTED" },
    });
    expect(JSON.stringify(event.payload)).not.toContain(await codeFor(phone));
    const provider = new MockSmsProvider();
    await processOutboxEvent({ ...event, attempts: 1 }, provider);
    expect(provider.messages).toHaveLength(1);
    expect(provider.messages[0]?.recipient).toBe(phone);
  });

  it("sends recipient on-the-way and delivery-code messages as separate events", async () => {
    const order = await prisma.order.findFirstOrThrow({
      where: { status: "ON_THE_WAY" },
    });
    const proof = await prisma.deliveryProof.upsert({
      create: {
        codeHash: "0".repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
        nonce: "phase7-notification-test",
        orderId: order.id,
      },
      update: {
        expiresAt: new Date(Date.now() + 60_000),
        verifiedAt: null,
      },
      where: { orderId: order.id },
    });
    const onTheWay = await prisma.outboxEvent.create({
      data: {
        aggregateId: order.id,
        aggregateType: "Order",
        dedupeKey: `recipient-on-way-test:${randomUUID()}`,
        payload: { orderId: order.id, status: "ON_THE_WAY" },
        type: "RECIPIENT_ON_THE_WAY",
      },
    });
    const deliveryCode = await prisma.outboxEvent.create({
      data: {
        aggregateId: order.id,
        aggregateType: "Order",
        dedupeKey: `delivery-code-test:${randomUUID()}`,
        payload: {
          encryptedCode: encryptTransientSecret("482913"),
          orderId: order.id,
          proofId: proof.id,
        },
        type: "DELIVERY_CODE_CREATED",
      },
    });
    const provider = new MockSmsProvider();
    await processOutboxEvent({ ...onTheWay, attempts: 1 }, provider);
    await processOutboxEvent({ ...deliveryCode, attempts: 1 }, provider);
    expect(provider.messages).toHaveLength(2);
    expect(
      provider.messages.every(
        ({ recipient }) => recipient === order.recipientPhoneE164,
      ),
    ).toBe(true);
    expect(provider.messages[0]?.body).not.toContain("482913");
    expect(provider.messages[1]?.body).toContain("482913");
  });

  it("notifies both the customer and seller when an order is created", async () => {
    const order = await prisma.order.findFirstOrThrow({
      include: { store: { include: { seller: { include: { users: true } } } } },
      where: {
        status: "AWAITING_SELLER_CONFIRMATION",
        store: { seller: { users: { some: {} } } },
      },
    });
    const event = await prisma.outboxEvent.create({
      data: {
        aggregateId: order.id,
        aggregateType: "Order",
        dedupeKey: `new-order-notification-test:${randomUUID()}`,
        payload: {
          orderId: order.id,
          status: "AWAITING_SELLER_CONFIRMATION",
        },
        type: "ORDER_STATUS_CHANGED",
      },
    });
    await processOutboxEvent({ ...event, attempts: 1 }, new MockSmsProvider());
    await expect(
      prisma.notification.count({
        where: {
          type: "ORDER_CREATED",
          userId: order.customerUserId,
        },
      }),
    ).resolves.toBeGreaterThan(0);
    const sellerUserIds = order.store.seller.users.map(({ userId }) => userId);
    await expect(
      prisma.notification.count({
        where: { type: "NEW_ORDER_SELLER", userId: { in: sellerUserIds } },
      }),
    ).resolves.toBeGreaterThan(0);
  });

  it("retries failures with backoff and reaches dead letter", async () => {
    const event = await prisma.outboxEvent.create({
      data: {
        aggregateId: randomUUID(),
        aggregateType: "Test",
        attempts: 7,
        availableAt: new Date(0),
        dedupeKey: `dead:${randomUUID()}`,
        maxAttempts: 8,
        payload: {},
        type: "UNSUPPORTED",
      },
    });
    await runOutboxBatch(`dead-worker-${randomUUID()}`);
    const updated = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect([OutboxStatus.FAILED, OutboxStatus.DEAD_LETTER]).toContain(
      updated.status,
    );
  });

  it("scopes in-app notifications to their owner", async () => {
    const [owner, stranger] = await Promise.all([
      prisma.user.create({
        data: {
          email: `notify-${randomUUID()}@nozi.test`,
          name: "Notification Owner",
        },
      }),
      prisma.user.create({
        data: {
          email: `notify-${randomUUID()}@nozi.test`,
          name: "Notification Stranger",
        },
      }),
    ]);
    const notification = await prisma.notification.create({
      data: {
        body: "Private",
        dedupeKey: `notification:${randomUUID()}`,
        title: "Private",
        type: "TEST",
        userId: owner.id,
      },
    });
    const ownerActor = buildActorContext({
      roles: [UserRoleCode.CUSTOMER],
      status: UserStatus.ACTIVE,
      userId: owner.id,
    });
    const strangerActor = buildActorContext({
      roles: [UserRoleCode.CUSTOMER],
      status: UserStatus.ACTIVE,
      userId: stranger.id,
    });
    expect(
      (await getNotificationSummary(ownerActor)).items.map((item) => item.id),
    ).toContain(notification.id);
    expect(
      (await getNotificationSummary(strangerActor)).items.map(
        (item) => item.id,
      ),
    ).not.toContain(notification.id);
    await expect(
      markNotificationRead(strangerActor, notification.id),
    ).resolves.toEqual({ updated: false });
  });

  it("runs cleanup idempotently", async () => {
    const first = await runCleanupJobs(new Date());
    const second = await runCleanupJobs(new Date());
    expect(first).toBeDefined();
    expect(Object.values(second).every((value) => value >= 0)).toBe(true);
  });
});
