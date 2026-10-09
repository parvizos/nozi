import { getEnv } from "@nozi/config";
import {
  CartStatus,
  OtpChallengeStatus,
  OutboxStatus,
  prisma,
} from "@nozi/database";

const hours = (value: number) => value * 60 * 60_000;
const days = (value: number) => value * 24 * 60 * 60_000;

export async function runCleanupJobs(now = new Date()) {
  const env = getEnv();
  const result = await prisma.$transaction(async (tx) => {
    const expiredOtp = await tx.otpChallenge.updateMany({
      data: { status: OtpChallengeStatus.EXPIRED },
      where: { expiresAt: { lt: now }, status: OtpChallengeStatus.PENDING },
    });
    const otp = await tx.otpChallenge.deleteMany({
      where: {
        createdAt: {
          lt: new Date(now.getTime() - hours(env.OTP_RETENTION_HOURS)),
        },
        status: { not: OtpChallengeStatus.PENDING },
      },
    });
    const invitations = await tx.courierInvitation.updateMany({
      data: { invalidatedAt: now },
      where: { consumedAt: null, expiresAt: { lt: now }, invalidatedAt: null },
    });
    const rateLimits = await tx.rateLimitBucket.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(now.getTime() - hours(env.RATE_LIMIT_RETENTION_HOURS)),
        },
      },
    });
    const idempotency = await tx.idempotencyKey.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(now.getTime() - hours(env.IDEMPOTENCY_RETENTION_HOURS)),
        },
      },
    });
    const carts = await tx.cart.updateMany({
      data: { status: CartStatus.ABANDONED },
      where: {
        status: CartStatus.ACTIVE,
        updatedAt: {
          lt: new Date(now.getTime() - days(env.ABANDONED_CART_RETENTION_DAYS)),
        },
      },
    });
    const sessions = await tx.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(now.getTime() - days(env.SESSION_RETENTION_DAYS)),
        },
      },
    });
    const locations = await tx.courierLocation.deleteMany({
      where: {
        recordedAt: {
          lt: new Date(
            now.getTime() - days(env.COURIER_LOCATION_RETENTION_DAYS),
          ),
        },
      },
    });
    const outbox = await tx.outboxEvent.deleteMany({
      where: {
        processedAt: {
          lt: new Date(now.getTime() - days(env.OUTBOX_RETENTION_DAYS)),
        },
        status: OutboxStatus.SENT,
      },
    });
    return {
      carts: carts.count,
      expiredOtp: expiredOtp.count,
      idempotency: idempotency.count,
      invitations: invitations.count,
      locations: locations.count,
      otp: otp.count,
      outbox: outbox.count,
      rateLimits: rateLimits.count,
      sessions: sessions.count,
    };
  });
  return result;
}

export async function updateWorkerHeartbeat(workerId: string, startedAt: Date) {
  return prisma.workerHeartbeat.upsert({
    create: { lastSeenAt: new Date(), startedAt, status: "RUNNING", workerId },
    update: { lastSeenAt: new Date(), status: "RUNNING" },
    where: { workerId },
  });
}
