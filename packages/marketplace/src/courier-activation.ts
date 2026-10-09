import { createHash, randomBytes } from "node:crypto";

import {
  hashPassword,
  Permission,
  assertPermission,
  type ActorContext,
} from "@nozi/auth";
import { getEnv } from "@nozi/config";
import { CourierStatus, Prisma, UserStatus, prisma } from "@nozi/database";
import { z } from "zod";

import { MarketplaceError } from "./errors";
import { consumeCourierActivationRateLimit } from "./rate-limit";

export const courierActivationSchema = z.object({
  password: z.string().min(12).max(128),
});

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createCourierInvitationInTransaction(
  tx: Prisma.TransactionClient,
  input: { courierId: string; createdByUserId: string; requestId?: string },
): Promise<{ expiresAt: Date; id: string; token: string }> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + getEnv().COURIER_INVITATION_TTL_HOURS * 60 * 60_000,
  );
  await tx.courierInvitation.updateMany({
    data: { invalidatedAt: now },
    where: {
      consumedAt: null,
      courierId: input.courierId,
      invalidatedAt: null,
    },
  });
  const invitation = await tx.courierInvitation.create({
    data: {
      courierId: input.courierId,
      createdByUserId: input.createdByUserId,
      expiresAt,
      tokenHash: tokenHash(token),
    },
  });
  await tx.auditLog.create({
    data: {
      action: "courier.invitation.created",
      actorRole: "ADMIN",
      actorUserId: input.createdByUserId,
      afterRedacted: { expiresAt: expiresAt.toISOString() },
      requestId: input.requestId ?? null,
      subjectId: invitation.id,
      subjectType: "CourierInvitation",
    },
  });
  return { expiresAt, id: invitation.id, token };
}

export async function resendCourierInvitation(
  actor: ActorContext,
  courierId: string,
  requestId?: string,
) {
  assertPermission(actor, Permission.CouriersManage);
  return prisma.$transaction(async (tx) => {
    const courier = await tx.courier.findUnique({ where: { id: courierId } });
    if (!courier)
      throw new MarketplaceError(
        "ADMIN_RESOURCE_NOT_FOUND",
        "Курьер не найден",
        404,
      );
    if (!courier.isActive || courier.status === CourierStatus.SUSPENDED)
      throw new MarketplaceError(
        "COURIER_ACTIVATION_BLOCKED",
        "Приглашение недоступно для заблокированного курьера",
        409,
      );
    return createCourierInvitationInTransaction(tx, {
      courierId,
      createdByUserId: actor.userId,
      ...(requestId ? { requestId } : {}),
    });
  });
}

export async function activateCourier(
  token: string,
  rawInput: z.infer<typeof courierActivationSchema>,
  requestId?: string,
) {
  const input = courierActivationSchema.parse(rawInput);
  const hash = tokenHash(token);
  await consumeCourierActivationRateLimit(hash);
  const passwordHash = await hashPassword(input.password);
  return prisma.$transaction(
    async (tx) => {
      const invitation = await tx.courierInvitation.findUnique({
        include: { courier: { include: { user: true } } },
        where: { tokenHash: hash },
      });
      const now = new Date();
      if (!invitation)
        throw new MarketplaceError(
          "COURIER_INVITATION_INVALID",
          "Приглашение недействительно",
          404,
        );
      if (invitation.consumedAt || invitation.invalidatedAt)
        throw new MarketplaceError(
          "COURIER_INVITATION_USED",
          "Приглашение уже использовано или заменено",
          409,
        );
      if (invitation.expiresAt <= now)
        throw new MarketplaceError(
          "COURIER_INVITATION_EXPIRED",
          "Срок действия приглашения истёк",
          410,
        );
      if (
        !invitation.courier.isActive ||
        invitation.courier.status === CourierStatus.SUSPENDED ||
        invitation.courier.user.status === UserStatus.SUSPENDED
      )
        throw new MarketplaceError(
          "COURIER_ACTIVATION_BLOCKED",
          "Аккаунт курьера заблокирован",
          403,
        );

      const consumed = await tx.courierInvitation.updateMany({
        data: { consumedAt: now },
        where: {
          consumedAt: null,
          id: invitation.id,
          invalidatedAt: null,
        },
      });
      if (consumed.count !== 1)
        throw new MarketplaceError(
          "COURIER_INVITATION_USED",
          "Приглашение уже использовано",
          409,
        );
      await tx.account.upsert({
        create: {
          accountId: invitation.courier.userId,
          password: passwordHash,
          providerId: "credential",
          userId: invitation.courier.userId,
        },
        update: { password: passwordHash },
        where: {
          providerId_accountId: {
            accountId: invitation.courier.userId,
            providerId: "credential",
          },
        },
      });
      await tx.user.update({
        data: { emailVerified: true, status: UserStatus.ACTIVE },
        where: { id: invitation.courier.userId },
      });
      await tx.courier.update({
        data: { status: CourierStatus.AVAILABLE },
        where: { id: invitation.courierId },
      });
      await tx.auditLog.create({
        data: {
          action: "courier.invitation.activated",
          actorRole: "COURIER",
          actorUserId: invitation.courier.userId,
          afterRedacted: { status: UserStatus.ACTIVE },
          beforeRedacted: { status: invitation.courier.user.status },
          requestId: requestId ?? null,
          subjectId: invitation.courierId,
          subjectType: "Courier",
        },
      });
      return { activated: true, email: invitation.courier.user.email };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
