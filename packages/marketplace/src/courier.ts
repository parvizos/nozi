import {
  assertPermission,
  AuthorizationError,
  Permission,
  type ActorContext,
} from "@nozi/auth";
import {
  CourierAssignmentStatus,
  CourierStatus,
  OrderActorType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  prisma,
} from "@nozi/database";
import { getEnv } from "@nozi/config";
import { enqueueOutboxEvent } from "@nozi/notifications";

import type {
  CourierDeliveryFilter,
  CourierFailureInput,
  CourierLocationInput,
} from "./courier-contracts";
import { MarketplaceError } from "./errors";
import { postCashCollectionLedger } from "./ledger";
import { issueDeliveryProof, verifyDeliveryProof } from "./delivery-proof";
import { transitionOrderInTransaction } from "./order-state-machine";
import { consumeCourierMutationRateLimit } from "./rate-limit";
import { dushanbeStartOfDay } from "./timezone";

export const activeCourierAssignmentStatuses = [
  CourierAssignmentStatus.ASSIGNED,
  CourierAssignmentStatus.ACCEPTED,
  CourierAssignmentStatus.ARRIVED_AT_STORE,
  CourierAssignmentStatus.PICKED_UP,
  CourierAssignmentStatus.ON_THE_WAY,
  CourierAssignmentStatus.DELIVERY_FAILED,
  CourierAssignmentStatus.RETURNING_TO_STORE,
] as const;

export type CourierDeliveryAction =
  | "ACCEPT"
  | "ARRIVE"
  | "PICKUP"
  | "START"
  | "DELIVER"
  | "RETURNED";

const actionConfig = {
  ACCEPT: {
    auditAction: "courier.assignment.accepted",
    expectedAssignment: CourierAssignmentStatus.ASSIGNED,
    nextAssignment: CourierAssignmentStatus.ACCEPTED,
    orderStatus: null,
    timestamp: "acceptedAt",
  },
  ARRIVE: {
    auditAction: "courier.arrived_at_store",
    expectedAssignment: CourierAssignmentStatus.ACCEPTED,
    nextAssignment: CourierAssignmentStatus.ARRIVED_AT_STORE,
    orderStatus: null,
    timestamp: "arrivedAtStoreAt",
  },
  PICKUP: {
    auditAction: "courier.order_picked_up",
    expectedAssignment: CourierAssignmentStatus.ARRIVED_AT_STORE,
    nextAssignment: CourierAssignmentStatus.PICKED_UP,
    orderStatus: OrderStatus.PICKED_UP,
    timestamp: "pickedUpAt",
  },
  START: {
    auditAction: "courier.delivery_started",
    expectedAssignment: CourierAssignmentStatus.PICKED_UP,
    nextAssignment: CourierAssignmentStatus.ON_THE_WAY,
    orderStatus: OrderStatus.ON_THE_WAY,
    timestamp: "onTheWayAt",
  },
  DELIVER: {
    auditAction: "courier.delivery_completed",
    expectedAssignment: CourierAssignmentStatus.ON_THE_WAY,
    nextAssignment: CourierAssignmentStatus.DELIVERED,
    orderStatus: OrderStatus.DELIVERED,
    timestamp: "deliveredAt",
  },
  RETURNED: {
    auditAction: "courier.return_completed",
    expectedAssignment: CourierAssignmentStatus.RETURNING_TO_STORE,
    nextAssignment: CourierAssignmentStatus.RETURNED_TO_STORE,
    orderStatus: OrderStatus.RETURNED_TO_STORE,
    timestamp: "updatedAt",
  },
} as const;

function assertCourierRole(actor: ActorContext): void {
  assertPermission(actor, Permission.CourierAccess);
}

function assertOperationalCourier(courier: {
  isActive: boolean;
  status: CourierStatus;
}): void {
  if (!courier.isActive || courier.status === CourierStatus.SUSPENDED) {
    throw new AuthorizationError(
      "ACCOUNT_INACTIVE",
      "Courier profile is not operational",
    );
  }
}

function isConcurrencyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ["P2002", "P2034"].includes(String(error.code))
  );
}

async function getCourierProfile(actor: ActorContext) {
  assertCourierRole(actor);
  const courier = await prisma.courier.findUnique({
    where: { userId: actor.userId },
  });
  if (!courier) {
    throw new MarketplaceError(
      "COURIER_DELIVERY_NOT_FOUND",
      "Профиль курьера не найден",
      404,
    );
  }
  return courier;
}

const deliveryInclude = {
  courier: { select: { id: true, name: true, phoneE164: true } },
  failures: { orderBy: { createdAt: "desc" as const }, take: 5 },
  locations: { orderBy: { recordedAt: "desc" as const }, take: 1 },
  order: {
    select: {
      anonymousDelivery: true,
      currencyCode: true,
      deliveryAddress: true,
      giftMessage: true,
      grandTotal: true,
      id: true,
      items: {
        select: {
          productName: true,
          quantity: true,
          variantName: true,
        },
      },
      orderNumber: true,
      paymentMethod: true,
      payment: {
        select: { method: true, paidAt: true, status: true },
      },
      recipientName: true,
      recipientPhoneE164: true,
      requestedDeliveryDate: true,
      requestedDeliveryWindowEnd: true,
      requestedDeliveryWindowStart: true,
      status: true,
      statusHistory: {
        orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
        select: {
          createdAt: true,
          newStatus: true,
          note: true,
          previousStatus: true,
        },
      },
      store: {
        select: {
          address: true,
          defaultPreparationMinutes: true,
          name: true,
          phoneE164: true,
          status: true,
        },
      },
      version: true,
    },
  },
} satisfies Prisma.CourierAssignmentInclude;

const historySelect = {
  deliveredAt: true,
  id: true,
  order: {
    select: {
      deliveryAddress: { select: { cityName: true } },
      orderNumber: true,
      store: { select: { name: true } },
    },
  },
  status: true,
  updatedAt: true,
} satisfies Prisma.CourierAssignmentSelect;

function serializeHistory(
  assignment: Prisma.CourierAssignmentGetPayload<{
    select: typeof historySelect;
  }>,
) {
  return {
    deliveredAt: assignment.deliveredAt,
    deliveryArea: assignment.order.deliveryAddress?.cityName ?? null,
    id: assignment.id,
    orderNumber: assignment.order.orderNumber,
    status: assignment.status,
    storeName: assignment.order.store.name,
    updatedAt: assignment.updatedAt,
  };
}

function serializeDelivery(
  assignment: Prisma.CourierAssignmentGetPayload<{
    include: typeof deliveryInclude;
  }>,
) {
  const payment = assignment.order.payment;
  return {
    ...assignment,
    deliveryCodeRequired: getEnv().ENABLE_DELIVERY_CODES,
    latestLocation: assignment.locations[0]
      ? {
          ...assignment.locations[0],
          accuracy: assignment.locations[0].accuracy?.toFixed(2) ?? null,
          latitude: assignment.locations[0].latitude.toFixed(6),
          longitude: assignment.locations[0].longitude.toFixed(6),
        }
      : null,
    locations: undefined,
    order: {
      ...assignment.order,
      amountToCollect:
        assignment.order.paymentMethod === PaymentMethod.CASH &&
        payment?.status !== PaymentStatus.PAID
          ? assignment.order.grandTotal.toFixed(2)
          : "0.00",
      grandTotal: assignment.order.grandTotal.toFixed(2),
    },
  };
}

export async function getCourierShell(actor: ActorContext) {
  const courier = await getCourierProfile(actor);
  return {
    id: courier.id,
    isActive: courier.isActive,
    name: courier.name,
    status: courier.status,
    transportType: courier.transportType,
  };
}

export async function getCourierDashboard(actor: ActorContext) {
  const courier = await getCourierProfile(actor);
  assertOperationalCourier(courier);
  const today = dushanbeStartOfDay();
  const [active, deliveredToday] = await Promise.all([
    prisma.courierAssignment.findMany({
      include: deliveryInclude,
      orderBy: { assignedAt: "asc" },
      take: 5,
      where: {
        courierId: courier.id,
        status: { in: [...activeCourierAssignmentStatuses] },
      },
    }),
    prisma.courierAssignment.count({
      where: {
        courierId: courier.id,
        deliveredAt: { gte: today },
        status: CourierAssignmentStatus.DELIVERED,
      },
    }),
  ]);
  return {
    active: active.map(serializeDelivery),
    courier: {
      isActive: courier.isActive,
      name: courier.name,
      status: courier.status,
      transportType: courier.transportType,
    },
    deliveredToday,
  };
}

export async function listCourierDeliveries(
  actor: ActorContext,
  input: CourierDeliveryFilter,
) {
  const courier = await getCourierProfile(actor);
  assertOperationalCourier(courier);
  const where: Prisma.CourierAssignmentWhereInput = {
    courierId: courier.id,
    status: { in: [...activeCourierAssignmentStatuses] },
  };
  const [items, total] = await Promise.all([
    prisma.courierAssignment.findMany({
      include: deliveryInclude,
      orderBy: { assignedAt: "asc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      where,
    }),
    prisma.courierAssignment.count({ where }),
  ]);
  return {
    items: items.map(serializeDelivery),
    page: input.page,
    total,
    totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
  };
}

export async function listCourierHistory(
  actor: ActorContext,
  input: Pick<CourierDeliveryFilter, "page" | "pageSize">,
) {
  const courier = await getCourierProfile(actor);
  const where: Prisma.CourierAssignmentWhereInput = {
    courierId: courier.id,
    status: {
      in: [
        CourierAssignmentStatus.DELIVERED,
        CourierAssignmentStatus.CANCELLED,
        CourierAssignmentStatus.RETURNED_TO_STORE,
      ],
    },
  };
  const [items, total] = await Promise.all([
    prisma.courierAssignment.findMany({
      orderBy: { updatedAt: "desc" },
      select: historySelect,
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      where,
    }),
    prisma.courierAssignment.count({ where }),
  ]);
  return {
    items: items.map(serializeHistory),
    page: input.page,
    total,
    totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
  };
}

export async function getCourierDelivery(
  actor: ActorContext,
  orderNumber: string,
) {
  const courier = await getCourierProfile(actor);
  assertOperationalCourier(courier);
  const assignment = await prisma.courierAssignment.findFirst({
    include: deliveryInclude,
    where: {
      courierId: courier.id,
      order: { orderNumber },
      status: { in: [...activeCourierAssignmentStatuses] },
    },
  });
  if (!assignment) {
    throw new MarketplaceError(
      "COURIER_DELIVERY_NOT_FOUND",
      "Доставка не найдена",
      404,
    );
  }
  return serializeDelivery(assignment);
}

export async function transitionCourierDelivery(
  actor: ActorContext,
  orderNumber: string,
  action: CourierDeliveryAction,
  requestId?: string,
  input?: { deliveryCode?: string },
) {
  assertCourierRole(actor);
  await consumeCourierMutationRateLimit(actor.userId, action.toLowerCase());
  const config = actionConfig[action];
  try {
    if (action === "DELIVER") {
      const verification = await prisma.$transaction(async (tx) => {
        const assignment = await tx.courierAssignment.findFirst({
          include: { courier: true },
          where: {
            courier: { userId: actor.userId },
            order: { orderNumber },
          },
        });
        if (!assignment)
          throw new MarketplaceError(
            "COURIER_DELIVERY_NOT_FOUND",
            "Доставка не найдена",
            404,
          );
        assertOperationalCourier(assignment.courier);
        if (
          assignment.status !== CourierAssignmentStatus.ON_THE_WAY &&
          assignment.status !== CourierAssignmentStatus.DELIVERED
        )
          throw new MarketplaceError(
            "COURIER_ACTION_CONFLICT",
            "Действие недоступно для текущего статуса доставки",
            409,
          );
        return verifyDeliveryProof(tx, assignment.orderId, input?.deliveryCode);
      });
      if (verification === "INVALID")
        throw new MarketplaceError(
          "DELIVERY_CODE_INVALID",
          "Неверный код подтверждения",
          422,
        );
    }
    return await prisma.$transaction(
      async (tx) => {
        const courier = await tx.courier.findUnique({
          where: { userId: actor.userId },
        });
        if (!courier)
          throw new MarketplaceError(
            "COURIER_DELIVERY_NOT_FOUND",
            "Профиль курьера не найден",
            404,
          );
        assertOperationalCourier(courier);
        const assignment = await tx.courierAssignment.findFirst({
          include: { order: { include: { payment: true } } },
          where: { courierId: courier.id, order: { orderNumber } },
        });
        if (!assignment)
          throw new MarketplaceError(
            "COURIER_DELIVERY_NOT_FOUND",
            "Доставка не найдена",
            404,
          );
        if (
          action === "DELIVER" &&
          assignment.status === CourierAssignmentStatus.DELIVERED &&
          assignment.order.status === OrderStatus.DELIVERED
        ) {
          return { idempotent: true, orderNumber, status: assignment.status };
        }
        if (assignment.status !== config.expectedAssignment) {
          throw new MarketplaceError(
            "COURIER_ACTION_CONFLICT",
            "Действие недоступно для текущего статуса доставки",
            409,
          );
        }
        const now = new Date();
        const timestampData = { [config.timestamp]: now };
        const updated = await tx.courierAssignment.updateMany({
          data: {
            ...timestampData,
            ...(action === "DELIVER" ? { requiresAdminAttention: false } : {}),
            status: config.nextAssignment,
          },
          where: { id: assignment.id, status: config.expectedAssignment },
        });
        if (updated.count !== 1)
          throw new MarketplaceError(
            "COURIER_ACTION_CONFLICT",
            "Доставка уже изменена другим процессом",
            409,
          );
        if (config.orderStatus) {
          await transitionOrderInTransaction(
            tx,
            {
              actorType: OrderActorType.COURIER,
              permissions: actor.permissions,
              roles: actor.roles,
              userId: actor.userId,
            },
            {
              expectedVersion: assignment.order.version,
              newStatus: config.orderStatus,
              orderId: assignment.orderId,
              requestId,
            },
          );
        }
        if (action === "START") {
          await enqueueOutboxEvent(tx, {
            aggregateId: assignment.orderId,
            aggregateType: "Order",
            dedupeKey: `recipient.on-the-way:${assignment.orderId}:${assignment.order.version + 1}`,
            payload: {
              orderId: assignment.orderId,
              status: OrderStatus.ON_THE_WAY,
            },
            type: "RECIPIENT_ON_THE_WAY",
          });
          const proof = await issueDeliveryProof(tx, assignment.orderId);
          if (proof)
            await enqueueOutboxEvent(tx, {
              aggregateId: assignment.orderId,
              aggregateType: "Order",
              dedupeKey: `delivery.code:${assignment.orderId}:${assignment.order.version + 1}`,
              payload: { orderId: assignment.orderId, ...proof },
              type: "DELIVERY_CODE_CREATED",
            });
        }
        if (action === "DELIVER") {
          const payment = assignment.order.payment;
          if (!payment)
            throw new MarketplaceError(
              "COURIER_ACTION_CONFLICT",
              "Платёж заказа не найден",
              409,
            );
          if (payment.method === PaymentMethod.CASH) {
            if (
              payment.status !== PaymentStatus.PENDING &&
              payment.status !== PaymentStatus.AUTHORIZED &&
              payment.status !== PaymentStatus.PAID
            )
              throw new MarketplaceError(
                "COURIER_ACTION_CONFLICT",
                "Наличный платёж нельзя завершить",
                409,
              );
            if (payment.status !== PaymentStatus.PAID) {
              await tx.payment.update({
                data: { paidAt: now, status: PaymentStatus.PAID },
                where: { id: payment.id },
              });
            }
            await postCashCollectionLedger(tx, {
              amount: payment.amount,
              courierId: courier.id,
              currencyCode: payment.currencyCode,
              orderId: assignment.orderId,
              userId: actor.userId,
            });
          } else if (
            payment.status !== PaymentStatus.PAID &&
            payment.status !== PaymentStatus.AUTHORIZED
          ) {
            throw new MarketplaceError(
              "COURIER_ACTION_CONFLICT",
              "Тестовый платёж не подтверждён",
              409,
            );
          }
          const otherActive = await tx.courierAssignment.count({
            where: {
              courierId: courier.id,
              id: { not: assignment.id },
              status: { in: [...activeCourierAssignmentStatuses] },
            },
          });
          await tx.courier.update({
            data: {
              status:
                otherActive > 0 ? CourierStatus.BUSY : CourierStatus.AVAILABLE,
            },
            where: { id: courier.id },
          });
          await tx.deliveryFailure.updateMany({
            data: { resolvedAt: now },
            where: { assignmentId: assignment.id, resolvedAt: null },
          });
        } else if (action === "RETURNED") {
          const otherActive = await tx.courierAssignment.count({
            where: {
              courierId: courier.id,
              id: { not: assignment.id },
              status: { in: [...activeCourierAssignmentStatuses] },
            },
          });
          await tx.courier.update({
            data: {
              status:
                otherActive > 0 ? CourierStatus.BUSY : CourierStatus.AVAILABLE,
            },
            where: { id: courier.id },
          });
          await tx.deliveryFailure.updateMany({
            data: { resolvedAt: now },
            where: { assignmentId: assignment.id, resolvedAt: null },
          });
        }
        await tx.auditLog.create({
          data: {
            action: config.auditAction,
            actorRole: OrderActorType.COURIER,
            actorUserId: actor.userId,
            afterRedacted: { status: config.nextAssignment },
            beforeRedacted: { status: assignment.status },
            requestId: requestId ?? null,
            subjectId: assignment.id,
            subjectType: "CourierAssignment",
          },
        });
        return {
          idempotent: false,
          orderNumber,
          status: config.nextAssignment,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (isConcurrencyError(error))
      throw new MarketplaceError(
        "COURIER_ACTION_CONFLICT",
        "Доставка уже изменена другим процессом",
        409,
      );
    throw error;
  }
}

export async function reportCourierDeliveryFailure(
  actor: ActorContext,
  orderNumber: string,
  input: CourierFailureInput,
  requestId?: string,
) {
  assertCourierRole(actor);
  await consumeCourierMutationRateLimit(actor.userId, "failed", 15);
  return prisma.$transaction(async (tx) => {
    const courier = await tx.courier.findUnique({
      where: { userId: actor.userId },
    });
    if (!courier)
      throw new MarketplaceError(
        "COURIER_DELIVERY_NOT_FOUND",
        "Профиль курьера не найден",
        404,
      );
    assertOperationalCourier(courier);
    const assignment = await tx.courierAssignment.findFirst({
      include: { order: true },
      where: {
        courierId: courier.id,
        order: { orderNumber },
        status: {
          in: [
            CourierAssignmentStatus.ACCEPTED,
            CourierAssignmentStatus.ARRIVED_AT_STORE,
            CourierAssignmentStatus.PICKED_UP,
            CourierAssignmentStatus.ON_THE_WAY,
          ],
        },
      },
    });
    if (!assignment)
      throw new MarketplaceError(
        "COURIER_ACTION_CONFLICT",
        "Нельзя зарегистрировать проблему для этой доставки",
        409,
      );
    const existingFailure = await tx.deliveryFailure.findFirst({
      where: { assignmentId: assignment.id, resolvedAt: null },
    });
    if (existingFailure) return existingFailure;
    const updated = await tx.courierAssignment.updateMany({
      data: {
        requiresAdminAttention: true,
        status: CourierAssignmentStatus.DELIVERY_FAILED,
      },
      where: { id: assignment.id, status: assignment.status },
    });
    if (updated.count !== 1)
      throw new MarketplaceError(
        "COURIER_ACTION_CONFLICT",
        "Доставка уже изменена другим процессом",
        409,
      );
    await transitionOrderInTransaction(
      tx,
      {
        actorType: OrderActorType.COURIER,
        permissions: actor.permissions,
        roles: actor.roles,
        userId: actor.userId,
      },
      {
        expectedVersion: assignment.order.version,
        newStatus: OrderStatus.DELIVERY_FAILED,
        note: `Delivery failed: ${input.reason}`,
        orderId: assignment.orderId,
        requestId,
      },
    );
    const failure = await tx.deliveryFailure.create({
      data: {
        assignmentId: assignment.id,
        note: input.note ?? null,
        reason: input.reason,
      },
    });
    await tx.auditLog.create({
      data: {
        action: "courier.delivery_failed",
        actorRole: OrderActorType.COURIER,
        actorUserId: actor.userId,
        afterRedacted: { reason: input.reason, requiresAdminAttention: true },
        requestId: requestId ?? null,
        subjectId: assignment.id,
        subjectType: "CourierAssignment",
      },
    });
    await enqueueOutboxEvent(tx, {
      aggregateId: assignment.orderId,
      aggregateType: "Order",
      dedupeKey: `delivery.failed:${failure.id}`,
      payload: {
        orderId: assignment.orderId,
        status: OrderStatus.DELIVERY_FAILED,
      },
      type: "DELIVERY_FAILED",
    });
    return failure;
  });
}

export async function recordCourierLocation(
  actor: ActorContext,
  input: CourierLocationInput,
) {
  assertCourierRole(actor);
  await consumeCourierMutationRateLimit(actor.userId, "location", 120);
  return prisma.$transaction(async (tx) => {
    const courier = await tx.courier.findUnique({
      where: { userId: actor.userId },
    });
    if (!courier)
      throw new MarketplaceError(
        "COURIER_DELIVERY_NOT_FOUND",
        "Профиль курьера не найден",
        404,
      );
    assertOperationalCourier(courier);
    const assignment = await tx.courierAssignment.findFirst({
      select: { id: true },
      where: {
        courierId: courier.id,
        order: { orderNumber: input.orderNumber },
        status: { in: [...activeCourierAssignmentStatuses] },
      },
    });
    if (!assignment)
      throw new MarketplaceError(
        "COURIER_DELIVERY_NOT_FOUND",
        "Активная доставка не найдена",
        404,
      );
    const recordedAt = new Date();
    const location = await tx.courierLocation.create({
      data: {
        accuracy: input.accuracy ?? null,
        assignmentId: assignment.id,
        courierId: courier.id,
        latitude: input.latitude,
        longitude: input.longitude,
        recordedAt,
      },
    });
    await tx.courier.update({
      data: {
        latitude: input.latitude,
        locationUpdatedAt: recordedAt,
        longitude: input.longitude,
      },
      where: { id: courier.id },
    });
    return {
      accuracy: location.accuracy?.toFixed(2) ?? null,
      id: location.id,
      latitude: location.latitude.toFixed(6),
      longitude: location.longitude.toFixed(6),
      recordedAt: location.recordedAt,
    };
  });
}
