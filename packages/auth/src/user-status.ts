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
  if (targetIsProtectedAdmin && command.status !== UserStatus.ACTIVE) {
    throw new AuthorizationError(
      "FORBIDDEN",
      "Administrative accounts cannot be deactivated through user management",
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
