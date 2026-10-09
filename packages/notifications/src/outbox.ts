import { createHash } from "node:crypto";

import { decryptTransientSecret } from "@nozi/auth";
import { getEnv } from "@nozi/config";
import {
  NotificationChannel,
  OrderStatus,
  OutboxStatus,
  Prisma,
  prisma,
  UserRoleCode,
  type OutboxEvent,
} from "@nozi/database";

import { createSmsProvider } from "./providers";
import { renderTemplate, type TemplateName } from "./templates";
import type {
  NotificationEventPayload,
  NotificationEventType,
  SmsProvider,
  TransactionClient,
} from "./types";

export async function enqueueOutboxEvent(
  tx: TransactionClient,
  input: {
    aggregateId: string;
    aggregateType: string;
    dedupeKey: string;
    payload: NotificationEventPayload;
    type: NotificationEventType;
  },
): Promise<void> {
  await tx.outboxEvent.upsert({
    create: {
      ...input,
      maxAttempts: getEnv().OUTBOX_MAX_ATTEMPTS,
      payload: input.payload as Prisma.InputJsonValue,
    },
    update: {},
    where: { dedupeKey: input.dedupeKey },
  });
}

type ClaimedEvent = OutboxEvent;

export async function claimOutboxEvents(
  workerId: string,
  limit = getEnv().OUTBOX_BATCH_SIZE,
): Promise<ClaimedEvent[]> {
  const staleBefore = new Date(Date.now() - 5 * 60_000);
  return prisma.$transaction(async (tx) => {
    await tx.outboxEvent.updateMany({
      data: {
        availableAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        status: OutboxStatus.FAILED,
      },
      where: { lockedAt: { lt: staleBefore }, status: OutboxStatus.PROCESSING },
    });
    return tx.$queryRaw<ClaimedEvent[]>(Prisma.sql`
      WITH candidates AS (
        SELECT id
        FROM outbox_events
        WHERE status IN ('PENDING'::"OutboxStatus", 'FAILED'::"OutboxStatus")
          AND available_at <= NOW()
        ORDER BY available_at ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      UPDATE outbox_events AS event
      SET status = 'PROCESSING'::"OutboxStatus",
          attempts = event.attempts + 1,
          locked_at = NOW(),
          locked_by = ${workerId},
          updated_at = NOW()
      FROM candidates
      WHERE event.id = candidates.id
      RETURNING
        event.id,
        event.type,
        event.aggregate_type AS "aggregateType",
        event.aggregate_id AS "aggregateId",
        event.payload,
        event.status,
        event.attempts,
        event.max_attempts AS "maxAttempts",
        event.available_at AS "availableAt",
        event.locked_at AS "lockedAt",
        event.locked_by AS "lockedBy",
        event.processed_at AS "processedAt",
        event.last_error AS "lastError",
        event.dedupe_key AS "dedupeKey",
        event.created_at AS "createdAt",
        event.updated_at AS "updatedAt"
    `);
  });
}

function recipientHash(recipient: string): string {
  return createHash("sha256").update(recipient).digest("hex");
}

async function deliverSms(
  event: ClaimedEvent,
  provider: SmsProvider,
  recipient: string,
  templateName: TemplateName,
  input: Parameters<typeof renderTemplate>[1],
): Promise<void> {
  const rendered = renderTemplate(templateName, input as never);
  const hashedRecipient = recipientHash(recipient);
  try {
    const result = await provider.send({
      ...rendered,
      channel: NotificationChannel.SMS,
      idempotencyKey: `${event.id}:${NotificationChannel.SMS}:${hashedRecipient}`,
      recipient,
    });
    await prisma.notificationDeliveryAttempt.create({
      data: {
        attemptNumber: event.attempts,
        channel: NotificationChannel.SMS,
        outboxEventId: event.id,
        provider: provider.name,
        ...(result.providerMessageId
          ? { providerMessageId: result.providerMessageId }
          : {}),
        recipientHash: hashedRecipient,
        status: result.skipped ? "SKIPPED" : "SENT",
      },
    });
  } catch (error) {
    await prisma.notificationDeliveryAttempt.create({
      data: {
        attemptNumber: event.attempts,
        channel: NotificationChannel.SMS,
        errorSafe:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Unknown provider failure",
        outboxEventId: event.id,
        provider: provider.name,
        recipientHash: hashedRecipient,
        status: "FAILED",
      },
    });
    throw error;
  }
}

async function createInApp(input: {
  event: ClaimedEvent;
  userId: string;
  templateName: TemplateName;
  templateInput: Parameters<typeof renderTemplate>[1];
  resourceType?: string;
  resourceId?: string;
}): Promise<void> {
  const rendered = renderTemplate(
    input.templateName,
    input.templateInput as never,
  );
  await prisma.notification.upsert({
    create: {
      ...rendered,
      dedupeKey: `${input.event.dedupeKey}:user:${input.userId}`,
      ...(input.resourceId ? { resourceId: input.resourceId } : {}),
      ...(input.resourceType ? { resourceType: input.resourceType } : {}),
      type: input.templateName,
      userId: input.userId,
    },
    update: {},
    where: { dedupeKey: `${input.event.dedupeKey}:user:${input.userId}` },
  });
}

function payload(event: ClaimedEvent): Record<string, unknown> {
  return event.payload as Record<string, unknown>;
}

async function processOtp(event: ClaimedEvent, provider: SmsProvider) {
  const challengeId = payload(event).challengeId;
  if (typeof challengeId !== "string")
    throw new Error("Invalid OTP event payload");
  const challenge = await prisma.otpChallenge.findUnique({
    where: { id: challengeId },
  });
  if (
    !challenge ||
    challenge.status !== "PENDING" ||
    challenge.expiresAt <= new Date()
  )
    return;
  await deliverSms(event, provider, challenge.phoneE164, "OTP_CODE", {
    code: decryptTransientSecret(challenge.encryptedCode),
    expiresMinutes: Math.ceil(getEnv().OTP_TTL_SECONDS / 60),
  });
}

const customerTemplates: Partial<Record<OrderStatus, TemplateName>> = {
  [OrderStatus.CONFIRMED]: "ORDER_CONFIRMED",
  [OrderStatus.PREPARING]: "ORDER_PREPARING",
  [OrderStatus.COURIER_ASSIGNED]: "COURIER_ASSIGNED",
  [OrderStatus.ON_THE_WAY]: "COURIER_ON_THE_WAY",
  [OrderStatus.DELIVERED]: "ORDER_DELIVERED",
  [OrderStatus.CANCELLED]: "ORDER_CANCELLED",
};

async function processOrderStatus(event: ClaimedEvent, provider: SmsProvider) {
  const orderId = payload(event).orderId;
  const status = payload(event).status as OrderStatus | undefined;
  if (typeof orderId !== "string" || !status)
    throw new Error("Invalid order event payload");
  const order = await prisma.order.findUnique({
    include: {
      customer: { select: { id: true, phoneNumber: true } },
      store: {
        include: {
          seller: { include: { users: { include: { user: true } } } },
        },
      },
    },
    where: { id: orderId },
  });
  if (!order) return;
  if (status === OrderStatus.AWAITING_SELLER_CONFIRMATION) {
    const templateInput = {
      amount: `${order.grandTotal.toFixed(2)} ${order.currencyCode}`,
      orderNumber: order.orderNumber,
    };
    for (const membership of order.store.seller.users) {
      await createInApp({
        event,
        resourceId: order.orderNumber,
        resourceType: "Order",
        templateInput,
        templateName: "NEW_ORDER_SELLER",
        userId: membership.userId,
      });
      if (membership.user.phoneNumber)
        await deliverSms(
          event,
          provider,
          membership.user.phoneNumber,
          "NEW_ORDER_SELLER",
          templateInput,
        );
    }
    return;
  }
  const templateName = customerTemplates[status];
  if (templateName) {
    const templateInput = { orderNumber: order.orderNumber };
    await createInApp({
      event,
      resourceId: order.orderNumber,
      resourceType: "Order",
      templateInput,
      templateName,
      userId: order.customerUserId,
    });
    if (order.customer.phoneNumber)
      await deliverSms(
        event,
        provider,
        order.customer.phoneNumber,
        templateName,
        templateInput,
      );
  }
  if (status === OrderStatus.CANCELLED) {
    for (const membership of order.store.seller.users)
      await createInApp({
        event,
        resourceId: order.orderNumber,
        resourceType: "Order",
        templateInput: { orderNumber: order.orderNumber },
        templateName: "ORDER_CANCELLED",
        userId: membership.userId,
      });
  }
}

async function processAssignment(event: ClaimedEvent, provider: SmsProvider) {
  const assignmentId = payload(event).assignmentId;
  if (typeof assignmentId !== "string")
    throw new Error("Invalid assignment event payload");
  const assignment = await prisma.courierAssignment.findUnique({
    include: {
      courier: { include: { user: true } },
      order: { include: { store: true } },
    },
    where: { id: assignmentId },
  });
  if (!assignment) return;
  const templateName =
    event.type === "COURIER_REASSIGNED"
      ? "DELIVERY_REASSIGNED"
      : event.type === "COURIER_ASSIGNMENT_CANCELLED"
        ? "DELIVERY_CANCELLED"
        : "DELIVERY_ASSIGNED";
  const templateInput =
    templateName === "DELIVERY_CANCELLED"
      ? { orderNumber: assignment.order.orderNumber }
      : {
          orderNumber: assignment.order.orderNumber,
          storeName: assignment.order.store.name,
        };
  await createInApp({
    event,
    resourceId: assignment.order.orderNumber,
    resourceType: "Order",
    templateInput,
    templateName,
    userId: assignment.courier.userId,
  });
  await deliverSms(
    event,
    provider,
    assignment.courier.phoneE164,
    templateName,
    templateInput,
  );
}

async function processDeliveryCode(event: ClaimedEvent, provider: SmsProvider) {
  const orderId = payload(event).orderId;
  const encryptedCode = payload(event).encryptedCode;
  const proofId = payload(event).proofId;
  if (
    typeof orderId !== "string" ||
    typeof encryptedCode !== "string" ||
    typeof proofId !== "string"
  )
    throw new Error("Invalid delivery code event payload");
  const order = await prisma.order.findUnique({
    include: { deliveryProof: true },
    where: { id: orderId },
  });
  if (
    !order ||
    order.deliveryProof?.id !== proofId ||
    order.deliveryProof.expiresAt <= new Date()
  )
    return;
  await deliverSms(event, provider, order.recipientPhoneE164, "DELIVERY_CODE", {
    code: decryptTransientSecret(encryptedCode),
    orderNumber: order.orderNumber,
  });
}

async function processRecipientOnTheWay(
  event: ClaimedEvent,
  provider: SmsProvider,
) {
  const orderId = payload(event).orderId;
  if (typeof orderId !== "string")
    throw new Error("Invalid recipient delivery event payload");
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  await deliverSms(
    event,
    provider,
    order.recipientPhoneE164,
    "RECIPIENT_ON_THE_WAY",
    { orderNumber: order.orderNumber },
  );
}

async function processDeliveryFailed(event: ClaimedEvent) {
  const orderId = payload(event).orderId;
  if (typeof orderId !== "string")
    throw new Error("Invalid delivery failure payload");
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  const admins = await prisma.user.findMany({
    select: { id: true },
    where: {
      roles: {
        some: {
          role: {
            code: { in: [UserRoleCode.ADMIN, UserRoleCode.SUPER_ADMIN] },
          },
        },
      },
      status: "ACTIVE",
    },
  });
  for (const admin of admins)
    await createInApp({
      event,
      resourceId: order.orderNumber,
      resourceType: "Order",
      templateInput: { orderNumber: order.orderNumber },
      templateName: "DELIVERY_FAILED_ADMIN",
      userId: admin.id,
    });
}

async function processCourierInvite(
  event: ClaimedEvent,
  provider: SmsProvider,
) {
  const courierId = payload(event).courierId;
  if (typeof courierId !== "string")
    throw new Error("Invalid courier invite payload");
  const courier = await prisma.courier.findUnique({ where: { id: courierId } });
  if (!courier) return;
  await deliverSms(event, provider, courier.phoneE164, "COURIER_INVITED", {});
}

export async function processOutboxEvent(
  event: ClaimedEvent,
  provider = createSmsProvider(),
): Promise<void> {
  switch (event.type as NotificationEventType) {
    case "OTP_REQUESTED":
      await processOtp(event, provider);
      return;
    case "ORDER_STATUS_CHANGED":
      await processOrderStatus(event, provider);
      return;
    case "COURIER_ASSIGNED":
    case "COURIER_REASSIGNED":
    case "COURIER_ASSIGNMENT_CANCELLED":
      await processAssignment(event, provider);
      return;
    case "DELIVERY_CODE_CREATED":
      await processDeliveryCode(event, provider);
      return;
    case "RECIPIENT_ON_THE_WAY":
      await processRecipientOnTheWay(event, provider);
      return;
    case "DELIVERY_FAILED":
      await processDeliveryFailed(event);
      return;
    case "COURIER_INVITED":
      await processCourierInvite(event, provider);
      return;
    default:
      throw new Error(`Unsupported outbox event type: ${event.type}`);
  }
}

export async function runOutboxBatch(
  workerId: string,
): Promise<{ claimed: number; failed: number; sent: number }> {
  const events = await claimOutboxEvents(workerId);
  let sent = 0;
  let failed = 0;
  const provider = createSmsProvider();
  for (const event of events) {
    try {
      await processOutboxEvent(event, provider);
      await prisma.outboxEvent.update({
        data: {
          lastError: null,
          lockedAt: null,
          lockedBy: null,
          processedAt: new Date(),
          status: OutboxStatus.SENT,
        },
        where: { id: event.id },
      });
      sent += 1;
    } catch (error) {
      const dead = event.attempts >= event.maxAttempts;
      const backoffSeconds = Math.min(
        3600,
        getEnv().OUTBOX_BASE_BACKOFF_SECONDS *
          2 ** Math.max(0, event.attempts - 1),
      );
      await prisma.outboxEvent.update({
        data: {
          availableAt: new Date(Date.now() + backoffSeconds * 1_000),
          lastError:
            error instanceof Error
              ? error.message.slice(0, 500)
              : "Unknown notification failure",
          lockedAt: null,
          lockedBy: null,
          status: dead ? OutboxStatus.DEAD_LETTER : OutboxStatus.FAILED,
        },
        where: { id: event.id },
      });
      failed += 1;
    }
  }
  return { claimed: events.length, failed, sent };
}
