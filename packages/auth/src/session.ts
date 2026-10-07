import { prisma, UserStatus } from "@nozi/database";

import { auth } from "./server";
import {
  AuthorizationError,
  buildActorContext,
  type ActorContext,
} from "./rbac";

export async function getActorContext(
  headers: Headers,
): Promise<ActorContext | null> {
  const authSession = await auth.api.getSession({ headers });

  if (!authSession) {
    return null;
  }

  const user = await prisma.user.findUnique({
    select: {
      adminPermissions: {
        select: {
          permission: {
            select: { code: true },
          },
        },
      },
      roles: {
        select: {
          role: {
            select: { code: true },
          },
        },
      },
      status: true,
    },
    where: { id: authSession.user.id },
  });

  if (!user || user.status !== UserStatus.ACTIVE) {
    return null;
  }

  return buildActorContext({
    explicitPermissions: user.adminPermissions.map(
      ({ permission }) => permission.code,
    ),
    roles: user.roles.map(({ role }) => role.code),
    status: user.status,
    userId: authSession.user.id,
  });
}

export async function requireActorContext(
  headers: Headers,
): Promise<ActorContext> {
  const actor = await getActorContext(headers);

  if (!actor) {
    throw new AuthorizationError(
      "AUTHENTICATION_REQUIRED",
      "Authentication is required",
    );
  }

  return actor;
}
