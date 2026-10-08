import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { assertPermission, Permission, type ActorContext } from "@nozi/auth";
import { getEnv } from "@nozi/config";
import { prisma, type Prisma } from "@nozi/database";

import { MarketplaceError } from "./errors";

function codeFor(orderId: string, nonce: string): string {
  const digest = createHmac("sha256", getEnv().AUTH_SECRET)
    .update(`delivery:${orderId}:${nonce}`)
    .digest();
  return (digest.readUInt32BE(0) % 1_000_000).toString().padStart(6, "0");
}

function hashCode(orderId: string, nonce: string, code: string): string {
  return createHash("sha256")
    .update(`${getEnv().AUTH_SECRET}:${orderId}:${nonce}:${code}`)
    .digest("hex");
}

export async function issueDeliveryProof(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  if (!getEnv().ENABLE_DELIVERY_CODES) return;
  const nonce = randomBytes(24).toString("base64url");
  const code = codeFor(orderId, nonce);
  await tx.deliveryProof.upsert({
    create: {
      codeHash: hashCode(orderId, nonce, code),
      expiresAt: new Date(
        Date.now() + getEnv().DELIVERY_CODE_TTL_MINUTES * 60_000,
      ),
      maxAttempts: getEnv().DELIVERY_CODE_MAX_ATTEMPTS,
      nonce,
      orderId,
    },
    update: {
      attemptCount: 0,
      codeHash: hashCode(orderId, nonce, code),
      expiresAt: new Date(
        Date.now() + getEnv().DELIVERY_CODE_TTL_MINUTES * 60_000,
      ),
      maxAttempts: getEnv().DELIVERY_CODE_MAX_ATTEMPTS,
      nonce,
      verifiedAt: null,
    },
    where: { orderId },
  });
}

export async function verifyDeliveryProof(
  tx: Prisma.TransactionClient,
  orderId: string,
  code: string | undefined,
): Promise<"VALID" | "INVALID"> {
  if (!getEnv().ENABLE_DELIVERY_CODES) return "VALID";
  const proof = await tx.deliveryProof.findUnique({ where: { orderId } });
  if (!proof)
    throw new MarketplaceError(
      "DELIVERY_PROOF_REQUIRED",
      "Код подтверждения доставки не создан",
      409,
    );
  if (proof.verifiedAt) return "VALID";
  if (proof.expiresAt <= new Date())
    throw new MarketplaceError(
      "DELIVERY_CODE_EXPIRED",
      "Код подтверждения истёк",
      409,
    );
  if (proof.attemptCount >= proof.maxAttempts)
    throw new MarketplaceError(
      "DELIVERY_CODE_LOCKED",
      "Превышено число попыток ввода кода",
      429,
    );
  if (!code || !/^\d{6}$/.test(code))
    throw new MarketplaceError(
      "DELIVERY_CODE_INVALID",
      "Введите шестизначный код получателя",
      422,
    );
  const expected = Buffer.from(proof.codeHash, "hex");
  const actual = Buffer.from(hashCode(orderId, proof.nonce, code), "hex");
  if (!timingSafeEqual(expected, actual)) {
    await tx.deliveryProof.update({
      data: { attemptCount: { increment: 1 } },
      where: { id: proof.id },
    });
    return "INVALID";
  }
  await tx.deliveryProof.update({
    data: { attemptCount: { increment: 1 }, verifiedAt: new Date() },
    where: { id: proof.id },
  });
  return "VALID";
}

export async function getDevelopmentDeliveryCode(
  actor: ActorContext,
  orderNumber: string,
): Promise<{ code: string }> {
  assertPermission(actor, Permission.OrdersManage);
  if (getEnv().NODE_ENV === "production")
    throw new MarketplaceError("FORBIDDEN", "Недоступно в production", 403);
  const order = await prisma.order.findUnique({
    include: { deliveryProof: true },
    where: { orderNumber },
  });
  if (!order?.deliveryProof)
    throw new MarketplaceError(
      "DELIVERY_PROOF_REQUIRED",
      "Код ещё не создан",
      404,
    );
  return { code: codeFor(order.id, order.deliveryProof.nonce) };
}

export async function overrideDeliveryProof(
  actor: ActorContext,
  orderNumber: string,
  reason: string,
  requestId?: string,
): Promise<void> {
  assertPermission(actor, Permission.OrdersManage);
  if (reason.trim().length < 3)
    throw new MarketplaceError("VALIDATION_ERROR", "Укажите причину", 400);
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { orderNumber } });
    await tx.deliveryProof.update({
      data: { verifiedAt: new Date() },
      where: { orderId: order.id },
    });
    await tx.auditLog.create({
      data: {
        action: "delivery.proof.overridden",
        actorRole: "ADMIN",
        actorUserId: actor.userId,
        reason,
        requestId: requestId ?? null,
        subjectId: order.id,
        subjectType: "Order",
      },
    });
  });
}
