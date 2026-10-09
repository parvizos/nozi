import {
  assertActiveActor,
  assertPermission,
  Permission,
  type ActorContext,
} from "@nozi/auth";
import { OutboxStatus, prisma } from "@nozi/database";

export async function getNotificationSummary(actor: ActorContext, page = 1) {
  assertActiveActor(actor);
  const pageSize = 30;
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({
      orderBy: { createdAt: "desc" },
      skip: (Math.max(1, page) - 1) * pageSize,
      take: pageSize,
      where: { userId: actor.userId },
    }),
    prisma.notification.count({ where: { userId: actor.userId } }),
    prisma.notification.count({
      where: { readAt: null, userId: actor.userId },
    }),
  ]);
  return { items, page: Math.max(1, page), pageSize, total, unread };
}

export async function getUnreadNotificationCount(actor: ActorContext) {
  assertActiveActor(actor);
  return prisma.notification.count({
    where: { readAt: null, userId: actor.userId },
  });
}

export async function markNotificationRead(
  actor: ActorContext,
  notificationId: string,
) {
  assertActiveActor(actor);
  const updated = await prisma.notification.updateMany({
    data: { readAt: new Date() },
    where: { id: notificationId, userId: actor.userId },
  });
  return { updated: updated.count === 1 };
}

export async function markAllNotificationsRead(actor: ActorContext) {
  assertActiveActor(actor);
  const updated = await prisma.notification.updateMany({
    data: { readAt: new Date() },
    where: { readAt: null, userId: actor.userId },
  });
  return { updated: updated.count };
}

export async function getNotificationSystemHealth(actor: ActorContext) {
  assertPermission(actor, Permission.AdminAccess);
  const [pending, failed, deadLetter, processing, heartbeat] =
    await Promise.all([
      prisma.outboxEvent.count({ where: { status: OutboxStatus.PENDING } }),
      prisma.outboxEvent.count({ where: { status: OutboxStatus.FAILED } }),
      prisma.outboxEvent.count({ where: { status: OutboxStatus.DEAD_LETTER } }),
      prisma.outboxEvent.count({ where: { status: OutboxStatus.PROCESSING } }),
      prisma.workerHeartbeat.findFirst({ orderBy: { lastSeenAt: "desc" } }),
    ]);
  return {
    deadLetter,
    failed,
    heartbeat,
    heartbeatAgeSeconds: heartbeat
      ? Math.floor(
          (new Date().getTime() - heartbeat.lastSeenAt.getTime()) / 1000,
        )
      : null,
    pending,
    processing,
  };
}
