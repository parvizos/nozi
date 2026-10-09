import {
  assertPermission,
  Permission,
  setUserStatus,
  type ActorContext,
} from "@nozi/auth";
import { getEnv } from "@nozi/config";
import {
  CourierAssignmentStatus,
  CourierStatus,
  LedgerDirection,
  OrderActorType,
  OrderStatus,
  PaymentStatus,
  Prisma,
  ProductStatus,
  SellerStatus,
  StoreStatus,
  UserRoleCode,
  UserStatus,
  prisma,
} from "@nozi/database";

import type {
  adminOrderFilterSchema,
  adminPageSchema,
  auditFilterSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  cashSettlementSchema,
  courierCreateSchema,
  courierUpdateSchema,
  financeRangeSchema,
  failedDeliveryRetrySchema,
  productModerationSchema,
  sellerAdminUpdateSchema,
  storeAdminUpdateSchema,
} from "./admin-contracts";
import { MarketplaceError } from "./errors";
import { createCourierInvitationInTransaction } from "./courier-activation";
import { transitionOrderInTransaction } from "./order-state-machine";
import { consumeAdminMutationRateLimit } from "./rate-limit";
import { validateDeliverySlot } from "./delivery-slots";
import { postCourierCashSettlementLedger } from "./ledger";
import { enqueueOutboxEvent } from "@nozi/notifications";
import type { z } from "zod";

type PageInput = z.infer<typeof adminPageSchema>;
type OrderFilter = z.infer<typeof adminOrderFilterSchema>;
type AuditFilter = z.infer<typeof auditFilterSchema>;
type FinanceRange = z.infer<typeof financeRangeSchema>;
const activeAssignmentStatuses = [
  CourierAssignmentStatus.ASSIGNED,
  CourierAssignmentStatus.ACCEPTED,
  CourierAssignmentStatus.ARRIVED_AT_STORE,
  CourierAssignmentStatus.PICKED_UP,
  CourierAssignmentStatus.ON_THE_WAY,
  CourierAssignmentStatus.DELIVERY_FAILED,
  CourierAssignmentStatus.RETURNING_TO_STORE,
];

function assertAdmin(
  actor: ActorContext,
  permission: Parameters<typeof assertPermission>[1],
) {
  assertPermission(actor, Permission.AdminAccess);
  assertPermission(actor, permission);
}
function decimal(value: Prisma.Decimal | null | undefined): string {
  return value?.toFixed(2) ?? "0.00";
}
function dates(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
    ...(to
      ? { lt: new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86_400_000) }
      : {}),
  };
}
async function audit(
  tx: Prisma.TransactionClient,
  actor: ActorContext,
  input: {
    action: string;
    after?: Prisma.InputJsonValue | undefined;
    before?: Prisma.InputJsonValue | undefined;
    reason?: string | undefined;
    requestId?: string | undefined;
    subjectId: string;
    subjectType: string;
  },
) {
  await tx.auditLog.create({
    data: {
      action: input.action,
      actorRole: "ADMIN",
      actorUserId: actor.userId,
      afterRedacted: input.after ?? Prisma.JsonNull,
      beforeRedacted: input.before ?? Prisma.JsonNull,
      reason: input.reason ?? null,
      requestId: input.requestId ?? null,
      subjectId: input.subjectId,
      subjectType: input.subjectType,
    },
  });
}
function principal(actor: ActorContext) {
  return {
    actorType: OrderActorType.ADMIN,
    permissions: actor.permissions,
    roles: actor.roles,
    userId: actor.userId,
  };
}
function isPrismaConcurrencyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ["P2002", "P2034"].includes(String(error.code))
  );
}

export async function getAdminShell(actor: ActorContext) {
  assertPermission(actor, Permission.AdminAccess);
  return {
    permissions: [...actor.permissions].filter(
      (p) => !p.startsWith("admin:") || p === Permission.AdminAccess,
    ),
  };
}

export async function getAdminDashboard(actor: ActorContext) {
  assertAdmin(actor, Permission.OrdersRead);
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60_000);
  const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60_000);
  const [
    statusCounts,
    todayAgg,
    deliveredToday,
    cancelledToday,
    sellerCounts,
    activeStores,
    activeProducts,
    customers,
    activeCouriers,
    awaitingAlerts,
    readyAlerts,
    failedPayments,
    pausedStores,
    preparingOrders,
    assignedOrders,
    onWayOrders,
    failedDeliveries,
  ] = await Promise.all([
    prisma.order.groupBy({
      _count: true,
      by: ["status"],
      where: {
        status: {
          in: [
            OrderStatus.AWAITING_SELLER_CONFIRMATION,
            OrderStatus.PREPARING,
            OrderStatus.READY_FOR_PICKUP,
            OrderStatus.COURIER_ASSIGNED,
            OrderStatus.ON_THE_WAY,
          ],
        },
      },
    }),
    prisma.order.aggregate({
      _count: true,
      _sum: { grandTotal: true },
      where: {
        createdAt: { gte: today },
        status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] },
      },
    }),
    prisma.order.count({ where: { deliveredAt: { gte: today } } }),
    prisma.order.count({ where: { cancelledAt: { gte: today } } }),
    prisma.seller.groupBy({
      _count: true,
      by: ["status"],
      where: { deletedAt: null },
    }),
    prisma.store.count({
      where: { deletedAt: null, isActive: true, status: StoreStatus.ACTIVE },
    }),
    prisma.product.count({
      where: { deletedAt: null, status: ProductStatus.ACTIVE },
    }),
    prisma.user.count({
      where: {
        deletedAt: null,
        roles: { some: { role: { code: UserRoleCode.CUSTOMER } } },
      },
    }),
    prisma.courier.count({
      where: { isActive: true, status: { not: CourierStatus.SUSPENDED } },
    }),
    prisma.order.findMany({
      select: {
        orderNumber: true,
        createdAt: true,
        store: { select: { name: true } },
      },
      take: 20,
      where: {
        createdAt: { lt: tenMinutesAgo },
        status: OrderStatus.AWAITING_SELLER_CONFIRMATION,
      },
    }),
    prisma.order.findMany({
      select: {
        orderNumber: true,
        updatedAt: true,
        store: { select: { name: true } },
      },
      take: 20,
      where: {
        status: OrderStatus.READY_FOR_PICKUP,
        updatedAt: { lt: fifteenMinutesAgo },
      },
    }),
    prisma.payment.count({ where: { status: PaymentStatus.FAILED } }),
    prisma.store.count({ where: { isTemporarilyPaused: true } }),
    prisma.order.findMany({
      select: {
        orderNumber: true,
        updatedAt: true,
        store: { select: { defaultPreparationMinutes: true, name: true } },
      },
      take: 100,
      where: { status: OrderStatus.PREPARING },
    }),
    prisma.order.findMany({
      select: {
        orderNumber: true,
        updatedAt: true,
        store: { select: { name: true } },
      },
      take: 20,
      where: {
        status: OrderStatus.COURIER_ASSIGNED,
        updatedAt: { lt: fifteenMinutesAgo },
      },
    }),
    prisma.order.findMany({
      select: {
        orderNumber: true,
        requestedDeliveryDate: true,
        requestedDeliveryWindowEnd: true,
        store: { select: { name: true } },
      },
      take: 20,
      where: { status: OrderStatus.ON_THE_WAY },
    }),
    prisma.courierAssignment.findMany({
      select: {
        order: {
          select: {
            orderNumber: true,
            store: { select: { name: true } },
          },
        },
      },
      take: 20,
      where: {
        requiresAdminAttention: true,
        status: { in: activeAssignmentStatuses },
      },
    }),
  ]);
  const count = (status: OrderStatus) =>
    statusCounts.find((x) => x.status === status)?._count ?? 0;
  const preparingAlerts = preparingOrders.filter(
    (o) =>
      now.getTime() - o.updatedAt.getTime() >
      (o.store.defaultPreparationMinutes + 15) * 60_000,
  );
  const onWayAlerts = onWayOrders.filter((o) => {
    const end = new Date(o.requestedDeliveryDate);
    end.setUTCHours(
      o.requestedDeliveryWindowEnd.getUTCHours(),
      o.requestedDeliveryWindowEnd.getUTCMinutes(),
    );
    return end < now;
  });
  return {
    alerts: [
      ...awaitingAlerts.map((o) => ({
        kind: "SELLER_LATE",
        orderNumber: o.orderNumber,
        store: o.store.name,
      })),
      ...readyAlerts.map((o) => ({
        kind: "COURIER_NEEDED",
        orderNumber: o.orderNumber,
        store: o.store.name,
      })),
      ...preparingAlerts.map((o) => ({
        kind: "PREPARATION_DELAY",
        orderNumber: o.orderNumber,
        store: o.store.name,
      })),
      ...assignedOrders.map((o) => ({
        kind: "PICKUP_DELAY",
        orderNumber: o.orderNumber,
        store: o.store.name,
      })),
      ...onWayAlerts.map((o) => ({
        kind: "DELIVERY_DELAY",
        orderNumber: o.orderNumber,
        store: o.store.name,
      })),
      ...failedDeliveries.map((assignment) => ({
        kind: "DELIVERY_FAILED",
        orderNumber: assignment.order.orderNumber,
        store: assignment.order.store.name,
      })),
    ],
    metrics: {
      activeCouriers,
      activeProducts,
      activeSellers:
        sellerCounts.find((x) => x.status === SellerStatus.APPROVED)?._count ??
        0,
      activeStores,
      awaitingSeller: count(OrderStatus.AWAITING_SELLER_CONFIRMATION),
      cancelledToday,
      courierAssigned: count(OrderStatus.COURIER_ASSIGNED),
      customers,
      deliveredToday,
      failedPayments,
      gmvToday: decimal(todayAgg._sum.grandTotal),
      onTheWay: count(OrderStatus.ON_THE_WAY),
      ordersToday: todayAgg._count,
      pausedStores,
      pendingSellers:
        sellerCounts.find((x) => x.status === SellerStatus.PENDING)?._count ??
        0,
      preparing: count(OrderStatus.PREPARING),
      readyForPickup: count(OrderStatus.READY_FOR_PICKUP),
    },
  };
}

export async function listAdminOrders(
  actor: ActorContext,
  filter: OrderFilter,
) {
  assertAdmin(actor, Permission.OrdersRead);
  const createdAt = dates(filter.from, filter.to);
  const where: Prisma.OrderWhereInput = {
    ...(filter.status === "ALL" ? {} : { status: filter.status }),
    ...(filter.storeId ? { storeId: filter.storeId } : {}),
    ...(filter.courierId
      ? {
          courierAssignments: {
            some: {
              courierId: filter.courierId,
              status: { in: activeAssignmentStatuses },
            },
          },
        }
      : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(filter.query
      ? {
          OR: [
            { orderNumber: { contains: filter.query, mode: "insensitive" } },
            { buyerName: { contains: filter.query, mode: "insensitive" } },
            {
              store: { name: { contains: filter.query, mode: "insensitive" } },
            },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      where,
      select: {
        createdAt: true,
        currencyCode: true,
        grandTotal: true,
        orderNumber: true,
        requestedDeliveryDate: true,
        requestedDeliveryWindowEnd: true,
        requestedDeliveryWindowStart: true,
        status: true,
        updatedAt: true,
        customer: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        courierAssignments: {
          orderBy: { assignedAt: "desc" },
          take: 1,
          where: { status: { in: activeAssignmentStatuses } },
          select: { courier: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.order.count({ where }),
  ]);
  return {
    items: items.map((o) => ({
      ...o,
      ageMinutes: Math.floor((Date.now() - o.updatedAt.getTime()) / 60_000),
      createdAt: o.createdAt.toISOString(),
      grandTotal: decimal(o.grandTotal),
      requestedDeliveryDate: o.requestedDeliveryDate.toISOString().slice(0, 10),
      requestedDeliveryWindowEnd: o.requestedDeliveryWindowEnd
        .toISOString()
        .slice(11, 16),
      requestedDeliveryWindowStart: o.requestedDeliveryWindowStart
        .toISOString()
        .slice(11, 16),
      updatedAt: o.updatedAt.toISOString(),
    })),
    page: filter.page,
    pageSize: filter.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / filter.pageSize)),
  };
}

export async function getAdminOrder(actor: ActorContext, orderNumber: string) {
  assertAdmin(actor, Permission.OrdersRead);
  const order = await prisma.order.findUnique({
    include: {
      adminNotes: {
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
      commission: true,
      courierAssignments: {
        include: { courier: true },
        orderBy: { assignedAt: "desc" },
      },
      customer: {
        select: {
          createdAt: true,
          email: true,
          id: true,
          name: true,
          phoneNumber: true,
          status: true,
        },
      },
      deliveryAddress: true,
      items: true,
      payment: true,
      statusHistory: {
        include: { changedBy: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
      store: { include: { seller: true } },
    },
    where: { orderNumber },
  });
  if (!order)
    throw new MarketplaceError("ORDER_NOT_FOUND", "Заказ не найден", 404);
  const events = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    where: { subjectId: order.id, subjectType: { in: ["Order", "order"] } },
  });
  return {
    ...order,
    commission: order.commission
      ? {
          ...order.commission,
          basisAmount: decimal(order.commission.basisAmount),
          commissionAmount: decimal(order.commission.commissionAmount),
          rate: order.commission.rate.toFixed(2),
        }
      : null,
    deliveryFee: decimal(order.deliveryFee),
    discountTotal: decimal(order.discountTotal),
    grandTotal: decimal(order.grandTotal),
    items: order.items.map((i) => ({
      ...i,
      lineTotal: decimal(i.lineTotal),
      unitPrice: decimal(i.unitPrice),
    })),
    itemsSubtotal: decimal(order.itemsSubtotal),
    auditEvents: events,
  };
}

export async function adminCancelOrder(
  actor: ActorContext,
  orderNumber: string,
  reason: string,
  requestId?: string,
) {
  assertAdmin(actor, Permission.OrdersManage);
  await consumeAdminMutationRateLimit(actor.userId, "order-cancel", 20);
  try {
    return await prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({ where: { orderNumber } });
        if (!order)
          throw new MarketplaceError("ORDER_NOT_FOUND", "Заказ не найден", 404);
        const active = await tx.courierAssignment.findMany({
          where: {
            orderId: order.id,
            status: { in: activeAssignmentStatuses },
          },
        });
        const transitioned = await transitionOrderInTransaction(
          tx,
          principal(actor),
          {
            cancellationReasonCode: "ADMIN_CANCELLED",
            expectedVersion: order.version,
            newStatus: OrderStatus.CANCELLED,
            note: reason,
            orderId: order.id,
            requestId,
          },
        );
        if (active.length) {
          const resolvedAt = new Date();
          await tx.courierAssignment.updateMany({
            data: {
              cancelledAt: resolvedAt,
              requiresAdminAttention: false,
              status: CourierAssignmentStatus.CANCELLED,
            },
            where: { id: { in: active.map((a) => a.id) } },
          });
          await tx.deliveryFailure.updateMany({
            data: { resolvedAt },
            where: {
              assignmentId: { in: active.map((a) => a.id) },
              resolvedAt: null,
            },
          });
          await tx.courier.updateMany({
            data: { status: CourierStatus.AVAILABLE },
            where: {
              id: { in: active.map((a) => a.courierId) },
              isActive: true,
            },
          });
          for (const assignment of active)
            await enqueueOutboxEvent(tx, {
              aggregateId: assignment.id,
              aggregateType: "CourierAssignment",
              dedupeKey: `courier.assignment_cancelled:${assignment.id}:${transitioned.version}`,
              payload: { assignmentId: assignment.id },
              type: "COURIER_ASSIGNMENT_CANCELLED",
            });
        }
        return transitioned;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (isPrismaConcurrencyError(error))
      throw new MarketplaceError(
        "INVALID_ORDER_TRANSITION",
        "Заказ уже изменён другим оператором",
        409,
      );
    throw error;
  }
}

export async function assignCourier(
  actor: ActorContext,
  orderNumber: string,
  courierId: string,
  requestId?: string,
  reassign = false,
) {
  assertAdmin(actor, Permission.CouriersManage);
  assertAdmin(actor, Permission.OrdersManage);
  await consumeAdminMutationRateLimit(actor.userId, "courier-assignment", 30);
  try {
    return await prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({ where: { orderNumber } });
        if (!order)
          throw new MarketplaceError("ORDER_NOT_FOUND", "Заказ не найден", 404);
        const courier = await tx.courier.findUnique({
          where: { id: courierId },
        });
        if (
          !courier ||
          !courier.isActive ||
          courier.status !== CourierStatus.AVAILABLE
        )
          throw new MarketplaceError(
            "COURIER_UNAVAILABLE",
            "Курьер недоступен",
            409,
          );
        const previous = await tx.courierAssignment.findFirst({
          where: {
            orderId: order.id,
            status: { in: activeAssignmentStatuses },
          },
        });
        if (previous && !reassign)
          throw new MarketplaceError(
            "COURIER_ASSIGNMENT_CONFLICT",
            "Курьер уже назначен",
            409,
          );
        if (reassign) {
          if (
            order.status !== OrderStatus.COURIER_ASSIGNED ||
            !previous ||
            previous.status === CourierAssignmentStatus.PICKED_UP
          )
            throw new MarketplaceError(
              "COURIER_ASSIGNMENT_CONFLICT",
              "Переназначение недоступно",
              409,
            );
          const resolvedAt = new Date();
          await tx.courierAssignment.update({
            data: {
              cancelledAt: resolvedAt,
              requiresAdminAttention: false,
              status: CourierAssignmentStatus.CANCELLED,
            },
            where: { id: previous.id },
          });
          await tx.deliveryFailure.updateMany({
            data: { resolvedAt },
            where: { assignmentId: previous.id, resolvedAt: null },
          });
          await tx.courier.update({
            data: { status: CourierStatus.AVAILABLE },
            where: { id: previous.courierId },
          });
          await enqueueOutboxEvent(tx, {
            aggregateId: previous.id,
            aggregateType: "CourierAssignment",
            dedupeKey: `courier.assignment_cancelled:${previous.id}:reassigned`,
            payload: { assignmentId: previous.id },
            type: "COURIER_ASSIGNMENT_CANCELLED",
          });
        } else {
          if (order.status !== OrderStatus.READY_FOR_PICKUP)
            throw new MarketplaceError(
              "INVALID_ORDER_TRANSITION",
              "Заказ ещё не готов к передаче",
              409,
            );
          await transitionOrderInTransaction(tx, principal(actor), {
            expectedVersion: order.version,
            newStatus: OrderStatus.COURIER_ASSIGNED,
            note: "Courier assigned",
            orderId: order.id,
            requestId,
          });
        }
        const assignment = await tx.courierAssignment.create({
          data: {
            assignedByAdminUserId: actor.userId,
            courierId,
            orderId: order.id,
          },
        });
        await enqueueOutboxEvent(tx, {
          aggregateId: assignment.id,
          aggregateType: "CourierAssignment",
          dedupeKey: `${reassign ? "courier.reassigned" : "courier.assigned"}:${assignment.id}`,
          payload: { assignmentId: assignment.id },
          type: reassign ? "COURIER_REASSIGNED" : "COURIER_ASSIGNED",
        });
        await tx.courier.update({
          data: { status: CourierStatus.BUSY },
          where: { id: courierId },
        });
        await audit(tx, actor, {
          action: reassign ? "courier.reassigned" : "courier.assigned",
          after: { courierId, status: assignment.status },
          before: previous
            ? { courierId: previous.courierId, status: previous.status }
            : undefined,
          requestId,
          subjectId: order.id,
          subjectType: "Order",
        });
        return assignment;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (isPrismaConcurrencyError(error))
      throw new MarketplaceError(
        "COURIER_ASSIGNMENT_CONFLICT",
        "Заказ уже изменён другим оператором",
        409,
      );
    throw error;
  }
}

export async function retryFailedDelivery(
  actor: ActorContext,
  orderNumber: string,
  input: z.infer<typeof failedDeliveryRetrySchema>,
  requestId?: string,
) {
  assertAdmin(actor, Permission.CouriersManage);
  assertAdmin(actor, Permission.OrdersManage);
  return prisma.$transaction(
    async (tx) => {
      const order = await tx.order.findUnique({
        include: {
          courierAssignments: {
            orderBy: { assignedAt: "desc" },
            take: 1,
            where: { status: CourierAssignmentStatus.DELIVERY_FAILED },
          },
          store: { include: { city: true, openingHours: true } },
        },
        where: { orderNumber },
      });
      if (
        !order ||
        order.status !== OrderStatus.DELIVERY_FAILED ||
        !order.courierAssignments[0]
      )
        throw new MarketplaceError(
          "FAILED_DELIVERY_CONFLICT",
          "Заказ не ожидает восстановления доставки",
          409,
        );
      validateDeliverySlot({
        date: input.deliveryDate,
        preparationMinutes: 0,
        store: {
          defaultPreparationMinutes: order.store.defaultPreparationMinutes,
          isActive: order.store.isActive,
          isOpen: order.store.isOpen,
          isTemporarilyPaused: order.store.isTemporarilyPaused,
          openingHours: order.store.openingHours,
          timezone: order.store.city.timezone,
        },
        windowEnd: input.deliveryWindowEnd,
        windowStart: input.deliveryWindowStart,
      });
      const previous = order.courierAssignments[0];
      const selected = await tx.courier.findUnique({
        where: { id: input.courierId },
      });
      const sameCourier = selected?.id === previous.courierId;
      if (
        !selected ||
        !selected.isActive ||
        selected.status === CourierStatus.SUSPENDED ||
        (!sameCourier && selected.status !== CourierStatus.AVAILABLE)
      )
        throw new MarketplaceError(
          "COURIER_UNAVAILABLE",
          "Курьер недоступен",
          409,
        );
      const now = new Date();
      const cancelled = await tx.courierAssignment.updateMany({
        data: {
          cancelledAt: now,
          requiresAdminAttention: false,
          status: CourierAssignmentStatus.CANCELLED,
        },
        where: {
          id: previous.id,
          status: CourierAssignmentStatus.DELIVERY_FAILED,
        },
      });
      if (cancelled.count !== 1)
        throw new MarketplaceError(
          "FAILED_DELIVERY_CONFLICT",
          "Восстановление уже выполнено",
          409,
        );
      await tx.courier.update({
        data: { status: CourierStatus.AVAILABLE },
        where: { id: previous.courierId },
      });
      await transitionOrderInTransaction(tx, principal(actor), {
        expectedVersion: order.version,
        newStatus: OrderStatus.RESCHEDULED,
        note: "Delivery retry scheduled",
        orderId: order.id,
        requestId,
      });
      const rescheduled = await tx.order.update({
        data: {
          requestedDeliveryDate: new Date(`${input.deliveryDate}T00:00:00Z`),
          requestedDeliveryWindowEnd: new Date(
            `1970-01-01T${input.deliveryWindowEnd}:00Z`,
          ),
          requestedDeliveryWindowStart: new Date(
            `1970-01-01T${input.deliveryWindowStart}:00Z`,
          ),
        },
        where: { id: order.id },
      });
      await transitionOrderInTransaction(tx, principal(actor), {
        expectedVersion: rescheduled.version,
        newStatus: OrderStatus.COURIER_ASSIGNED,
        note: "Courier assigned for retry",
        orderId: order.id,
        requestId,
      });
      const assignment = await tx.courierAssignment.create({
        data: {
          assignedByAdminUserId: actor.userId,
          courierId: selected.id,
          orderId: order.id,
        },
      });
      await enqueueOutboxEvent(tx, {
        aggregateId: assignment.id,
        aggregateType: "CourierAssignment",
        dedupeKey: `courier.reassigned:${assignment.id}:retry`,
        payload: { assignmentId: assignment.id },
        type: "COURIER_REASSIGNED",
      });
      await tx.courier.update({
        data: { status: CourierStatus.BUSY },
        where: { id: selected.id },
      });
      await tx.deliveryFailure.updateMany({
        data: { resolvedAt: now },
        where: { assignmentId: previous.id, resolvedAt: null },
      });
      await audit(tx, actor, {
        action: "delivery.retry_scheduled",
        after: { courierId: selected.id, status: assignment.status },
        before: { courierId: previous.courierId, status: previous.status },
        requestId,
        subjectId: order.id,
        subjectType: "Order",
      });
      return assignment;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function startFailedDeliveryReturn(
  actor: ActorContext,
  orderNumber: string,
  requestId?: string,
) {
  assertAdmin(actor, Permission.OrdersManage);
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { orderNumber } });
    if (!order || order.status !== OrderStatus.DELIVERY_FAILED)
      throw new MarketplaceError(
        "FAILED_DELIVERY_CONFLICT",
        "Заказ не ожидает возврата",
        409,
      );
    const assignment = await tx.courierAssignment.findFirst({
      where: {
        orderId: order.id,
        status: CourierAssignmentStatus.DELIVERY_FAILED,
      },
    });
    if (!assignment)
      throw new MarketplaceError(
        "FAILED_DELIVERY_CONFLICT",
        "Активное назначение не найдено",
        409,
      );
    const changed = await tx.courierAssignment.updateMany({
      data: { status: CourierAssignmentStatus.RETURNING_TO_STORE },
      where: {
        id: assignment.id,
        status: CourierAssignmentStatus.DELIVERY_FAILED,
      },
    });
    if (changed.count !== 1)
      throw new MarketplaceError(
        "FAILED_DELIVERY_CONFLICT",
        "Возврат уже начат",
        409,
      );
    return transitionOrderInTransaction(tx, principal(actor), {
      expectedVersion: order.version,
      newStatus: OrderStatus.RETURNING_TO_STORE,
      note: "Return to store requested by operations",
      orderId: order.id,
      requestId,
    });
  });
}

export async function addAdminOrderNote(
  actor: ActorContext,
  orderNumber: string,
  body: string,
  requestId?: string,
) {
  assertAdmin(actor, Permission.OrdersManage);
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      select: { id: true },
      where: { orderNumber },
    });
    if (!order)
      throw new MarketplaceError("ORDER_NOT_FOUND", "Заказ не найден", 404);
    const note = await tx.adminNote.create({
      data: { authorUserId: actor.userId, body, orderId: order.id },
    });
    await audit(tx, actor, {
      action: "admin_note.created",
      after: { noteId: note.id },
      requestId,
      subjectId: order.id,
      subjectType: "Order",
    });
    return note;
  });
}

export async function listAdminSellers(actor: ActorContext, input: PageInput) {
  assertAdmin(actor, Permission.SellersRead);
  const where: Prisma.SellerWhereInput = {
    deletedAt: null,
    ...(input.query
      ? {
          OR: [
            { publicName: { contains: input.query, mode: "insensitive" } },
            { legalName: { contains: input.query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.seller.findMany({
      include: {
        _count: { select: { stores: true } },
        stores: {
          select: { id: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      where,
    }),
    prisma.seller.count({ where }),
  ]);
  const storeIds = items.flatMap((seller) => seller.stores.map(({ id }) => id));
  const aggregates = storeIds.length
    ? await prisma.order.groupBy({
        _count: { _all: true },
        _sum: { grandTotal: true },
        by: ["storeId"],
        where: {
          status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] },
          storeId: { in: storeIds },
        },
      })
    : [];
  const byStore = new Map(aggregates.map((row) => [row.storeId, row]));
  return {
    items: items.map((s) => ({
      id: s.id,
      legalName: s.legalName,
      publicName: s.publicName,
      status: s.status,
      storeCount: s._count.stores,
      gmv: decimal(
        s.stores.reduce(
          (sum, store) => sum.add(byStore.get(store.id)?._sum.grandTotal ?? 0),
          new Prisma.Decimal(0),
        ),
      ),
      orderCount: s.stores.reduce(
        (count, store) => count + (byStore.get(store.id)?._count._all ?? 0),
        0,
      ),
    })),
    page: input.page,
    total,
    totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
  };
}
export async function getAdminSeller(actor: ActorContext, sellerId: string) {
  assertAdmin(actor, Permission.SellersRead);
  const seller = await prisma.seller.findUnique({
    include: {
      adminNotes: {
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
      stores: {
        include: { _count: { select: { orders: true, products: true } } },
      },
      users: {
        include: {
          user: { select: { email: true, name: true, status: true } },
        },
      },
    },
    where: { id: sellerId },
  });
  if (!seller)
    throw new MarketplaceError(
      "ADMIN_RESOURCE_NOT_FOUND",
      "Продавец не найден",
      404,
    );
  return seller;
}
export async function updateAdminSeller(
  actor: ActorContext,
  sellerId: string,
  input: z.infer<typeof sellerAdminUpdateSchema>,
  requestId?: string,
) {
  assertAdmin(actor, Permission.SellersManage);
  return prisma.$transaction(async (tx) => {
    const current = await tx.seller.findUnique({ where: { id: sellerId } });
    if (!current)
      throw new MarketplaceError(
        "ADMIN_RESOURCE_NOT_FOUND",
        "Продавец не найден",
        404,
      );
    const seller = await tx.seller.update({
      data: {
        approvedAt:
          input.status === SellerStatus.APPROVED
            ? new Date()
            : current.approvedAt,
        approvedByUserId:
          input.status === SellerStatus.APPROVED
            ? actor.userId
            : current.approvedByUserId,
        rejectionReason:
          input.status === SellerStatus.REJECTED
            ? (input.reason ?? "Rejected by admin")
            : null,
        status: input.status,
      },
      where: { id: sellerId },
    });
    if (input.status === SellerStatus.SUSPENDED)
      await tx.store.updateMany({
        data: { isActive: false, status: StoreStatus.SUSPENDED },
        where: { sellerId },
      });
    if (
      input.status === SellerStatus.APPROVED &&
      current.status === SellerStatus.SUSPENDED
    )
      await tx.store.updateMany({
        data: { isActive: true, status: StoreStatus.PAUSED },
        where: { sellerId, status: StoreStatus.SUSPENDED },
      });
    await audit(tx, actor, {
      action: "seller.status_changed",
      after: { status: seller.status },
      before: { status: current.status },
      reason: input.reason,
      requestId,
      subjectId: sellerId,
      subjectType: "Seller",
    });
    return seller;
  });
}

export async function getAdminStore(actor: ActorContext, storeId: string) {
  assertAdmin(actor, Permission.StoresRead);
  const store = await prisma.store.findUnique({
    include: {
      _count: { select: { orders: true, products: true } },
      address: true,
      seller: true,
    },
    where: { id: storeId },
  });
  if (!store)
    throw new MarketplaceError(
      "ADMIN_RESOURCE_NOT_FOUND",
      "Магазин не найден",
      404,
    );
  return store;
}
export async function updateAdminStore(
  actor: ActorContext,
  storeId: string,
  input: z.infer<typeof storeAdminUpdateSchema>,
  requestId?: string,
) {
  assertPermission(actor, Permission.AdminAccess);
  if (input.commissionRate !== undefined)
    assertPermission(actor, Permission.FinanceCommissionManage);
  if (input.isActive !== undefined || input.status !== undefined)
    assertPermission(actor, Permission.StoresManage);
  return prisma.$transaction(async (tx) => {
    const current = await tx.store.findUnique({ where: { id: storeId } });
    if (!current)
      throw new MarketplaceError(
        "ADMIN_RESOURCE_NOT_FOUND",
        "Магазин не найден",
        404,
      );
    const store = await tx.store.update({
      data: {
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        ...(input.status ? { status: input.status } : {}),
      },
      where: { id: storeId },
    });
    if (input.commissionRate !== undefined) {
      const seller = await tx.seller.findUniqueOrThrow({
        where: { id: current.sellerId },
      });
      await tx.seller.update({
        data: { defaultCommissionRate: input.commissionRate },
        where: { id: current.sellerId },
      });
      await tx.commissionRateHistory.create({
        data: {
          changedByUserId: actor.userId,
          newRate: input.commissionRate,
          oldRate: seller.defaultCommissionRate,
          reason: input.commissionReason!,
          sellerId: current.sellerId,
        },
      });
      await audit(tx, actor, {
        action: "seller.commission_rate_changed",
        after: { rate: input.commissionRate },
        before: { rate: seller.defaultCommissionRate.toFixed(2) },
        reason: input.commissionReason,
        requestId,
        subjectId: current.sellerId,
        subjectType: "Seller",
      });
    }
    await audit(tx, actor, {
      action: "store.moderated",
      after: { isActive: store.isActive, status: store.status },
      before: { isActive: current.isActive, status: current.status },
      requestId,
      subjectId: storeId,
      subjectType: "Store",
    });
    return store;
  });
}

export async function listAdminProducts(actor: ActorContext, input: PageInput) {
  assertAdmin(actor, Permission.ProductsModerate);
  const where: Prisma.ProductWhereInput = input.query
    ? {
        OR: [
          { name: { contains: input.query, mode: "insensitive" } },
          { store: { name: { contains: input.query, mode: "insensitive" } } },
        ],
      }
    : {};
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      include: {
        category: { select: { name: true } },
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
        store: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      where,
    }),
    prisma.product.count({ where }),
  ]);
  return {
    items: items.map((p) => ({ ...p, price: decimal(p.price) })),
    page: input.page,
    total,
    totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
  };
}
export async function moderateProduct(
  actor: ActorContext,
  productId: string,
  input: z.infer<typeof productModerationSchema>,
  requestId?: string,
) {
  assertAdmin(actor, Permission.ProductsModerate);
  return prisma.$transaction(async (tx) => {
    const current = await tx.product.findUnique({ where: { id: productId } });
    if (!current)
      throw new MarketplaceError("PRODUCT_UNAVAILABLE", "Товар не найден", 404);
    const allowedModeration: Record<ProductStatus, readonly ProductStatus[]> = {
      [ProductStatus.DRAFT]: [ProductStatus.ARCHIVED],
      [ProductStatus.PENDING_REVIEW]: [
        ProductStatus.ACTIVE,
        ProductStatus.REJECTED,
        ProductStatus.ARCHIVED,
      ],
      [ProductStatus.ACTIVE]: [ProductStatus.HIDDEN, ProductStatus.ARCHIVED],
      [ProductStatus.HIDDEN]: [ProductStatus.ACTIVE, ProductStatus.ARCHIVED],
      [ProductStatus.REJECTED]: [ProductStatus.ARCHIVED],
      [ProductStatus.ARCHIVED]: [],
    };
    if (!allowedModeration[current.status].includes(input.status))
      throw new MarketplaceError(
        "PRODUCT_MODERATION_CONFLICT",
        `Переход ${current.status} → ${input.status} запрещён`,
        409,
      );
    const product = await tx.product.update({
      data: {
        deletedAt: input.status === ProductStatus.ARCHIVED ? new Date() : null,
        moderatedAt: new Date(),
        moderatedByUserId: actor.userId,
        moderationNote: input.note ?? null,
        status: input.status,
        version: { increment: 1 },
      },
      where: { id: productId },
    });
    await audit(tx, actor, {
      action: "product.moderated",
      after: { status: product.status },
      before: { status: current.status },
      reason: input.note,
      requestId,
      subjectId: productId,
      subjectType: "Product",
    });
    return product;
  });
}

export async function listAdminCustomers(
  actor: ActorContext,
  input: PageInput,
) {
  assertAdmin(actor, Permission.CustomersRead);
  const where: Prisma.UserWhereInput = {
    roles: { some: { role: { code: UserRoleCode.CUSTOMER } } },
    ...(input.query
      ? {
          OR: [
            { email: { contains: input.query, mode: "insensitive" } },
            { name: { contains: input.query, mode: "insensitive" } },
            { phoneNumber: { contains: input.query } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        _count: { select: { orders: true } },
        createdAt: true,
        email: true,
        id: true,
        name: true,
        phoneNumber: true,
        status: true,
      },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      where,
    }),
    prisma.user.count({ where }),
  ]);
  return {
    items,
    page: input.page,
    total,
    totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
  };
}
export async function getAdminCustomer(actor: ActorContext, userId: string) {
  assertAdmin(actor, Permission.CustomersRead);
  const customer = await prisma.user.findFirst({
    select: {
      adminNotesCustomer: {
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
      createdAt: true,
      email: true,
      id: true,
      name: true,
      orders: {
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
          grandTotal: true,
          orderNumber: true,
          status: true,
          store: { select: { name: true } },
        },
        take: 50,
      },
      phoneNumber: true,
      status: true,
    },
    where: {
      id: userId,
      roles: { some: { role: { code: UserRoleCode.CUSTOMER } } },
    },
  });
  if (!customer)
    throw new MarketplaceError(
      "ADMIN_RESOURCE_NOT_FOUND",
      "Покупатель не найден",
      404,
    );
  return {
    ...customer,
    orders: customer.orders.map((o) => ({
      ...o,
      grandTotal: decimal(o.grandTotal),
    })),
  };
}
export async function updateAdminCustomer(
  actor: ActorContext,
  userId: string,
  status: UserStatus,
  requestId?: string,
  reason = "Customer account status change",
) {
  assertAdmin(actor, Permission.CustomersManage);
  if (status !== UserStatus.ACTIVE && status !== UserStatus.SUSPENDED)
    throw new MarketplaceError("VALIDATION_ERROR", "Недопустимый статус", 400);
  const target = await prisma.user.findFirst({
    select: { id: true },
    where: {
      id: userId,
      roles: { some: { role: { code: UserRoleCode.CUSTOMER } } },
    },
  });
  if (!target)
    throw new MarketplaceError(
      "ADMIN_RESOURCE_NOT_FOUND",
      "Покупатель не найден",
      404,
    );
  await setUserStatus(actor, {
    reason,
    ...(requestId ? { requestId } : {}),
    requiredPermission: Permission.CustomersManage,
    status,
    targetUserId: userId,
  });
  return prisma.user.findUniqueOrThrow({ where: { id: userId } });
}

export async function listCouriers(actor: ActorContext) {
  assertAdmin(actor, Permission.CouriersManage);
  return prisma.courier.findMany({
    include: {
      assignments: {
        include: { order: { select: { orderNumber: true, status: true } } },
        take: 5,
        where: { status: { in: activeAssignmentStatuses } },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
export async function createCourier(
  actor: ActorContext,
  input: z.infer<typeof courierCreateSchema>,
  requestId?: string,
) {
  assertAdmin(actor, Permission.CouriersManage);
  return prisma.$transaction(async (tx) => {
    const role = await tx.role.findUniqueOrThrow({
      where: { code: UserRoleCode.COURIER },
    });
    const user = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        phoneNumber: input.phoneE164,
        roles: { create: { createdByUserId: actor.userId, roleId: role.id } },
        status: UserStatus.INVITED,
      },
    });
    const courier = await tx.courier.create({
      data: {
        isActive: true,
        name: input.name,
        phoneE164: input.phoneE164,
        status: input.status,
        transportType: input.transportType ?? null,
        userId: user.id,
      },
    });
    await audit(tx, actor, {
      action: "courier.created",
      after: { status: courier.status, transportType: courier.transportType },
      requestId,
      subjectId: courier.id,
      subjectType: "Courier",
    });
    const invitation = await createCourierInvitationInTransaction(tx, {
      courierId: courier.id,
      createdByUserId: actor.userId,
      ...(requestId ? { requestId } : {}),
    });
    await enqueueOutboxEvent(tx, {
      aggregateId: courier.id,
      aggregateType: "Courier",
      dedupeKey: `courier.invited:${invitation.id}`,
      payload: { courierId: courier.id },
      type: "COURIER_INVITED",
    });
    return {
      ...courier,
      activationExpiresAt: invitation.expiresAt,
      activationUrl:
        getEnv().NODE_ENV === "production"
          ? null
          : `${getEnv().APP_URL}/activate/courier/${invitation.token}`,
    };
  });
}
export async function updateCourier(
  actor: ActorContext,
  courierId: string,
  input: z.infer<typeof courierUpdateSchema>,
  requestId?: string,
) {
  assertAdmin(actor, Permission.CouriersManage);
  return prisma.$transaction(async (tx) => {
    const current = await tx.courier.findUnique({ where: { id: courierId } });
    if (!current)
      throw new MarketplaceError(
        "ADMIN_RESOURCE_NOT_FOUND",
        "Курьер не найден",
        404,
      );
    if (
      !input.isActive &&
      (await tx.courierAssignment.count({
        where: { courierId, status: { in: activeAssignmentStatuses } },
      }))
    )
      throw new MarketplaceError(
        "COURIER_ASSIGNMENT_CONFLICT",
        "У курьера есть активная доставка",
        409,
      );
    const courier = await tx.courier.update({
      data: {
        isActive: input.isActive,
        status: input.isActive ? input.status : CourierStatus.SUSPENDED,
        transportType: input.transportType ?? null,
      },
      where: { id: courierId },
    });
    await audit(tx, actor, {
      action: "courier.updated",
      after: { isActive: courier.isActive, status: courier.status },
      before: { isActive: current.isActive, status: current.status },
      requestId,
      subjectId: courierId,
      subjectType: "Courier",
    });
    return courier;
  });
}

export async function listCategoriesAdmin(actor: ActorContext) {
  assertAdmin(actor, Permission.CategoriesManage);
  return prisma.category.findMany({
    include: {
      _count: { select: { children: true, products: true } },
      parent: { select: { name: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}
export async function createCategory(
  actor: ActorContext,
  input: z.infer<typeof categoryCreateSchema>,
  requestId?: string,
) {
  assertAdmin(actor, Permission.CategoriesManage);
  return prisma.$transaction(async (tx) => {
    const category = await tx.category.create({
      data: {
        ...input,
        description: input.description ?? null,
        parentId: input.parentId ?? null,
      },
    });
    await audit(tx, actor, {
      action: "category.created",
      after: { name: category.name, slug: category.slug },
      requestId,
      subjectId: category.id,
      subjectType: "Category",
    });
    return category;
  });
}
export async function updateCategory(
  actor: ActorContext,
  categoryId: string,
  input: z.infer<typeof categoryUpdateSchema>,
  requestId?: string,
) {
  assertAdmin(actor, Permission.CategoriesManage);
  return prisma.$transaction(async (tx) => {
    const current = await tx.category.findUnique({ where: { id: categoryId } });
    if (!current)
      throw new MarketplaceError(
        "ADMIN_RESOURCE_NOT_FOUND",
        "Категория не найдена",
        404,
      );
    if (input.parentId === categoryId)
      throw new MarketplaceError(
        "VALIDATION_ERROR",
        "Категория не может быть родителем самой себя",
        400,
      );
    const category = await tx.category.update({
      data: {
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.sortOrder !== undefined
          ? { sortOrder: input.sortOrder }
          : {}),
      },
      where: { id: categoryId },
    });
    await audit(tx, actor, {
      action: "category.updated",
      after: {
        isActive: category.isActive,
        name: category.name,
        sortOrder: category.sortOrder,
      },
      before: {
        isActive: current.isActive,
        name: current.name,
        sortOrder: current.sortOrder,
      },
      requestId,
      subjectId: categoryId,
      subjectType: "Category",
    });
    return category;
  });
}

export async function getFinanceOverview(
  actor: ActorContext,
  range: FinanceRange,
) {
  assertAdmin(actor, Permission.FinanceRead);
  const createdAt = dates(range.from, range.to);
  const [payments, ledger, financialEntries] = await Promise.all([
    prisma.payment.groupBy({
      _count: true,
      _sum: { amount: true },
      by: ["status"],
      where: createdAt ? { createdAt } : {},
    }),
    prisma.ledgerTransaction.findMany({
      include: { entries: { include: { account: true } } },
      orderBy: { effectiveAt: "desc" },
      take: 100,
      where: createdAt ? { effectiveAt: createdAt } : {},
    }),
    prisma.ledgerEntry.findMany({
      include: {
        account: { select: { accountType: true } },
        transaction: { select: { eventType: true } },
      },
      where: {
        transaction: {
          ...(createdAt ? { effectiveAt: createdAt } : {}),
          eventType: { in: ["ORDER_PLACED", "ORDER_CANCELLED"] },
        },
      },
    }),
  ]);
  const accountNet = (accountType: string, natural: LedgerDirection) =>
    financialEntries
      .filter((entry) => entry.account.accountType === accountType)
      .reduce(
        (sum, entry) =>
          entry.direction === natural
            ? sum.add(entry.amount)
            : sum.sub(entry.amount),
        new Prisma.Decimal(0),
      );
  const gmv = accountNet("PAYMENT_CLEARING", LedgerDirection.DEBIT);
  const commission = accountNet("COMMISSION_REVENUE", LedgerDirection.CREDIT);
  const delivery = accountNet("DELIVERY_REVENUE", LedgerDirection.CREDIT);
  const sellerAmount = accountNet("SELLER_PAYABLE", LedgerDirection.CREDIT);
  const refunds = payments
    .filter((p) => p.status === PaymentStatus.REFUNDED)
    .reduce((sum, p) => sum.add(p._sum.amount ?? 0), new Prisma.Decimal(0));
  return {
    deliveryFees: decimal(delivery),
    gmv: decimal(gmv),
    ledger: ledger.map((t) => {
      const debit = t.entries
        .filter((e) => e.direction === LedgerDirection.DEBIT)
        .reduce((s, e) => s.add(e.amount), new Prisma.Decimal(0));
      const credit = t.entries
        .filter((e) => e.direction === LedgerDirection.CREDIT)
        .reduce((s, e) => s.add(e.amount), new Prisma.Decimal(0));
      return {
        ...t,
        balanced: debit.equals(credit),
        credit: decimal(credit),
        debit: decimal(debit),
        entries: t.entries.map((e) => ({ ...e, amount: decimal(e.amount) })),
      };
    }),
    marketplaceCommission: decimal(commission),
    paymentBreakdown: payments.map((p) => ({
      amount: decimal(p._sum.amount),
      count: p._count,
      status: p.status,
    })),
    refunds: decimal(refunds),
    sellerAmount: decimal(sellerAmount),
  };
}

export async function getCourierCashBalances(actor: ActorContext) {
  assertAdmin(actor, Permission.FinanceRead);
  const accounts = await prisma.ledgerAccount.findMany({
    include: {
      entries: { select: { amount: true, direction: true } },
    },
    where: {
      accountType: "CASH_IN_TRANSIT",
      ownerType: "COURIER",
    },
  });
  return Promise.all(
    accounts.map(async (account) => {
      const outstanding = account.entries.reduce(
        (sum, entry) =>
          entry.direction === LedgerDirection.DEBIT
            ? sum.add(entry.amount)
            : sum.sub(entry.amount),
        new Prisma.Decimal(0),
      );
      const courier = account.ownerId
        ? await prisma.courier.findUnique({
            select: { id: true, name: true },
            where: { id: account.ownerId },
          })
        : null;
      const lastSettlement = account.ownerId
        ? await prisma.courierCashSettlement.findFirst({
            orderBy: { createdAt: "desc" },
            where: { courierId: account.ownerId },
          })
        : null;
      return {
        courier,
        currencyCode: account.currencyCode,
        lastSettlement,
        outstanding: outstanding.toFixed(2),
      };
    }),
  );
}

export async function recordCourierCashSettlement(
  actor: ActorContext,
  input: z.infer<typeof cashSettlementSchema>,
  requestId?: string,
) {
  assertAdmin(actor, Permission.FinanceCashManage);
  const amount = new Prisma.Decimal(input.amount);
  if (!amount.greaterThan(0))
    throw new MarketplaceError(
      "VALIDATION_ERROR",
      "Сумма должна быть больше нуля",
      400,
    );
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.courierCashSettlement.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return existing;
      const courier = await tx.courier.findUnique({
        where: { id: input.courierId },
      });
      if (!courier)
        throw new MarketplaceError(
          "ADMIN_RESOURCE_NOT_FOUND",
          "Курьер не найден",
          404,
        );
      const account = await tx.ledgerAccount.findFirst({
        where: {
          accountType: "CASH_IN_TRANSIT",
          currencyCode: input.currencyCode,
          ownerId: courier.id,
          ownerType: "COURIER",
        },
      });
      if (!account)
        throw new MarketplaceError(
          "CASH_SETTLEMENT_CONFLICT",
          "У курьера нет наличных к сверке",
          409,
        );
      const totals = await tx.ledgerEntry.groupBy({
        _sum: { amount: true },
        by: ["direction"],
        where: { ledgerAccountId: account.id },
      });
      const debit =
        totals.find((row) => row.direction === LedgerDirection.DEBIT)?._sum
          .amount ?? new Prisma.Decimal(0);
      const credit =
        totals.find((row) => row.direction === LedgerDirection.CREDIT)?._sum
          .amount ?? new Prisma.Decimal(0);
      const outstanding = debit.sub(credit);
      if (amount.greaterThan(outstanding))
        throw new MarketplaceError(
          "CASH_SETTLEMENT_CONFLICT",
          "Сумма сверки превышает задолженность курьера",
          409,
        );
      const settlement = await tx.courierCashSettlement.create({
        data: {
          amount,
          courierId: courier.id,
          createdByUserId: actor.userId,
          currencyCode: input.currencyCode,
          idempotencyKey: input.idempotencyKey,
          reason: input.reason,
          reference: input.reference ?? null,
        },
      });
      await postCourierCashSettlementLedger(tx, {
        amount,
        courierId: courier.id,
        currencyCode: input.currencyCode,
        settlementId: settlement.id,
        userId: actor.userId,
      });
      await audit(tx, actor, {
        action: "courier.cash_settled",
        after: { amount: amount.toFixed(2), currencyCode: input.currencyCode },
        reason: input.reason,
        requestId,
        subjectId: settlement.id,
        subjectType: "CourierCashSettlement",
      });
      return settlement;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function listAuditLogs(actor: ActorContext, input: AuditFilter) {
  assertAdmin(actor, Permission.AuditRead);
  const createdAt = dates(input.from, input.to);
  const where: Prisma.AuditLogWhereInput = {
    ...(input.action
      ? { action: { contains: input.action, mode: "insensitive" } }
      : {}),
    ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(input.subjectType ? { subjectType: input.subjectType } : {}),
    ...(input.query
      ? {
          OR: [
            { action: { contains: input.query, mode: "insensitive" } },
            { subjectId: { contains: input.query } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      include: { actor: { select: { email: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      where,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return {
    items,
    page: input.page,
    total,
    totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
  };
}
