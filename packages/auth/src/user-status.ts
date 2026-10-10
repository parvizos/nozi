import { prisma, UserRoleCode, UserStatus } from "@nozi/database";

import {
  assertPermission,
  AuthorizationError,
  Permission,
  type PermissionCode,
  type ActorContext,
} from "./rbac";

export async function setUserStatus(
  actor: ActorContext,
  command: {
    reason: string;
    requestId?: string;
    requiredPermission?: PermissionCode;
    status: UserStatus;
    targetUserId: string;
  },
): Promise<void> {
  assertPermission(actor, command.requiredPermission ?? Permission.AdminManage);

  const reason = command.reason.trim();
  if (reason.length < 3 || reason.length > 500) {
    throw new Error(
      "A status change reason between 3 and 500 characters is required",
    );
  }

  if (
    actor.userId === command.targetUserId &&
    command.status !== UserStatus.ACTIVE
  ) {
    throw new AuthorizationError(
      "FORBIDDEN",
      "An administrator cannot deactivate their own account",
    );
  }

  const target = await prisma.user.findUnique({
    select: {
      roles: { select: { role: { select: { code: true } } } },
      status: true,
    },
    where: { id: command.targetUserId },
  });

  if (!target) {
    throw new Error("User not found");
  }

  const targetIsProtectedAdmin = target.roles.some(
    ({ role }) =>
      role.code === UserRoleCode.SUPER_ADMIN ||
      role.code === UserRoleCode.ADMIN,
  );
  if (targetIsProtectedAdmin) {
    throw new AuthorizationError(
      "FORBIDDEN",
      "Administrative accounts cannot be changed through customer management",
    );
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({
      data: { status: command.status },
      where: { id: command.targetUserId },
    });

    if (command.status !== UserStatus.ACTIVE) {
      await transaction.session.deleteMany({
        where: { userId: command.targetUserId },
      });
    }

    await transaction.auditLog.create({
      data: {
        action: "user.status.changed",
        actorRole: [...actor.roles].sort().join(","),
        actorUserId: actor.userId,
        afterRedacted: { status: command.status },
        beforeRedacted: { status: target.status },
        reason,
        requestId: command.requestId ?? null,
        subjectId: command.targetUserId,
        subjectType: "user",
      },
    });
  });
}

export async function setAdminUserStatus(
  actor: ActorContext,
  command: {
    reason: string;
    requestId?: string;
    status: UserStatus;
    targetUserId: string;
  },
): Promise<void> {
  assertPermission(actor, Permission.AdminManage);
  if (
    command.status !== UserStatus.ACTIVE &&
    command.status !== UserStatus.SUSPENDED
  )
    throw new AuthorizationError(
      "FORBIDDEN",
      "Unsupported administrator status",
    );
  if (!actor.roles.has(UserRoleCode.SUPER_ADMIN))
    throw new AuthorizationError(
      "FORBIDDEN",
      "Only a super administrator can manage administrator access",
    );
  if (actor.userId === command.targetUserId)
    throw new AuthorizationError(
      "FORBIDDEN",
      "A super administrator cannot change their own status",
    );
  const reason = command.reason.trim();
  if (reason.length < 3 || reason.length > 500)
    throw new Error(
      "A status change reason between 3 and 500 characters is required",
    );
  const target = await prisma.user.findUnique({
    select: {
      roles: { select: { role: { select: { code: true } } } },
      status: true,
    },
    where: { id: command.targetUserId },
  });
  if (!target) throw new Error("User not found");
  const codes = target.roles.map(({ role }) => role.code);
  if (codes.includes(UserRoleCode.SUPER_ADMIN))
    throw new AuthorizationError(
      "FORBIDDEN",
      "Super administrator accounts cannot be suspended",
    );
  if (!codes.includes(UserRoleCode.ADMIN))
    throw new AuthorizationError(
      "FORBIDDEN",
      "The target is not an administrator",
    );
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      data: { status: command.status },
      where: { id: command.targetUserId },
    });
    if (command.status === UserStatus.SUSPENDED)
      await tx.session.deleteMany({ where: { userId: command.targetUserId } });
    await tx.auditLog.create({
      data: {
        action: "admin.status.changed",
        actorRole: UserRoleCode.SUPER_ADMIN,
        actorUserId: actor.userId,
        afterRedacted: { status: command.status },
        beforeRedacted: { status: target.status },
        reason,
        requestId: command.requestId ?? null,
        subjectId: command.targetUserId,
        subjectType: "AdminUser",
      },
    });
  });
}

export async function listAdminUsers(actor: ActorContext) {
  assertPermission(actor, Permission.AdminManage);
  return prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      createdAt: true,
      email: true,
      id: true,
      name: true,
      roles: { select: { role: { select: { code: true } } } },
      status: true,
    },
    where: {
      roles: {
        some: {
          role: {
            code: { in: [UserRoleCode.ADMIN, UserRoleCode.SUPER_ADMIN] },
          },
        },
      },
    },
  });
}
