import type { ActorContext } from "@nozi/auth";
import {
  InventoryReservationStatus,
  OrderActorType,
  OrderStatus,
  OrderStatusSource,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  UserRoleCode,
  prisma,
} from "@nozi/database";

import { MarketplaceError } from "./errors";

type TransitionPrincipal = {
  actorType: OrderActorType;
  roles: ReadonlySet<UserRoleCode>;
  userId: string | null;
};

export type TransitionOrderInput = {
  cancellationReasonCode?: string | undefined;
  expectedVersion?: number | undefined;
  newStatus: OrderStatus;
  note?: string | undefined;
  orderId: string;
  requestId?: string | undefined;
  source?: OrderStatusSource;
};

export const allowedOrderTransitions: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  [OrderStatus.CREATED]: [
    OrderStatus.AWAITING_SELLER_CONFIRMATION,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.AWAITING_SELLER_CONFIRMATION]: [
    OrderStatus.CONFIRMED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.CONFIRMED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [
    OrderStatus.READY_FOR_PICKUP,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.READY_FOR_PICKUP]: [OrderStatus.COURIER_ASSIGNED],
  [OrderStatus.COURIER_ASSIGNED]: [OrderStatus.PICKED_UP],
  [OrderStatus.PICKED_UP]: [OrderStatus.ON_THE_WAY],
  [OrderStatus.ON_THE_WAY]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [OrderStatus.REFUNDED],
  [OrderStatus.REFUNDED]: [],
};

function principalFromActor(actor: ActorContext): TransitionPrincipal {
  let actorType: OrderActorType = OrderActorType.CUSTOMER;
  if (
    actor.roles.has(UserRoleCode.ADMIN) ||
    actor.roles.has(UserRoleCode.SUPER_ADMIN)
  ) {
    actorType = OrderActorType.ADMIN;
  } else if (actor.roles.has(UserRoleCode.SELLER)) {
    actorType = OrderActorType.SELLER;
  } else if (actor.roles.has(UserRoleCode.COURIER)) {
    actorType = OrderActorType.COURIER;
  }
  return { actorType, roles: actor.roles, userId: actor.userId };
}

export const systemTransitionPrincipal: TransitionPrincipal = {
  actorType: OrderActorType.SYSTEM,
  roles: new Set<UserRoleCode>(),
  userId: null,
};

async function assertTransitionPermission(
  tx: Prisma.TransactionClient,
  principal: TransitionPrincipal,
  order: { status: OrderStatus; storeId: string },
  newStatus: OrderStatus,
): Promise<void> {
  if (principal.actorType === OrderActorType.SYSTEM) return;
  if (principal.actorType === OrderActorType.ADMIN) return;
  if (principal.actorType === OrderActorType.CUSTOMER) {
    throw new MarketplaceError(
      "INVALID_ORDER_TRANSITION",
      "Покупатель не может менять операционный статус заказа",
      409,
    );
  }
  if (principal.actorType === OrderActorType.SELLER && principal.userId) {
    const membership = await tx.sellerUser.count({
      where: {
        isActive: true,
        seller: {
          deletedAt: null,
          status: "APPROVED",
          stores: { some: { deletedAt: null, id: order.storeId } },
        },
        userId: principal.userId,
      },
    });
    const sellerStatuses: readonly OrderStatus[] = [
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.READY_FOR_PICKUP,
      OrderStatus.CANCELLED,
    ];
    if (membership > 0 && sellerStatuses.includes(newStatus)) return;
  }
  if (principal.actorType === OrderActorType.COURIER) {
    const courierStatuses: readonly OrderStatus[] = [
      OrderStatus.PICKED_UP,
      OrderStatus.ON_THE_WAY,
      OrderStatus.DELIVERED,
    ];
    if (courierStatuses.includes(newStatus)) return;
  }
  throw new MarketplaceError(
    "INVALID_ORDER_TRANSITION",
    "Недостаточно прав для этого перехода",
    409,
  );
}

async function releaseReservations(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const reservations = await tx.inventoryReservation.findMany({
    where: { orderId, status: InventoryReservationStatus.ACTIVE },
  });
  for (const reservation of reservations) {
    await tx.product.updateMany({
      data: { reservedQuantity: { decrement: reservation.quantity } },
      where: {
        id: reservation.productId,
        reservedQuantity: { gte: reservation.quantity },
      },
    });
    if (reservation.productVariantId) {
      await tx.productVariant.updateMany({
        data: { reservedQuantity: { decrement: reservation.quantity } },
        where: {
          id: reservation.productVariantId,
          reservedQuantity: { gte: reservation.quantity },
        },
      });
    }
  }
  await tx.inventoryReservation.updateMany({
    data: { status: InventoryReservationStatus.RELEASED },
    where: { orderId, status: InventoryReservationStatus.ACTIVE },
  });
}

async function consumeReservations(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const reservations = await tx.inventoryReservation.findMany({
    where: { orderId, status: InventoryReservationStatus.ACTIVE },
  });
  for (const reservation of reservations) {
    const product = await tx.product.updateMany({
      data: {
        reservedQuantity: { decrement: reservation.quantity },
        stockQuantity: { decrement: reservation.quantity },
      },
      where: {
        id: reservation.productId,
        reservedQuantity: { gte: reservation.quantity },
        stockQuantity: { gte: reservation.quantity },
      },
    });
    if (product.count !== 1)
      throw new Error("Invalid product reservation state");
    if (reservation.productVariantId) {
      const variant = await tx.productVariant.updateMany({
        data: {
          reservedQuantity: { decrement: reservation.quantity },
          stockQuantity: { decrement: reservation.quantity },
        },
        where: {
          id: reservation.productVariantId,
          reservedQuantity: { gte: reservation.quantity },
          stockQuantity: { gte: reservation.quantity },
        },
      });
      if (variant.count !== 1)
        throw new Error("Invalid variant reservation state");
    }
  }
  await tx.inventoryReservation.updateMany({
    data: { status: InventoryReservationStatus.CONSUMED },
    where: { orderId, status: InventoryReservationStatus.ACTIVE },
  });
}

export async function transitionOrderInTransaction(
  tx: Prisma.TransactionClient,
  principal: TransitionPrincipal,
  input: TransitionOrderInput,
) {
  const order = await tx.order.findUnique({
    select: { id: true, status: true, storeId: true, version: true },
    where: { id: input.orderId },
  });
  if (!order) {
    throw new MarketplaceError("ORDER_NOT_FOUND", "Заказ не найден", 404);
  }
  if (!allowedOrderTransitions[order.status].includes(input.newStatus)) {
    throw new MarketplaceError(
      "INVALID_ORDER_TRANSITION",
      `Переход ${order.status} → ${input.newStatus} запрещён`,
      409,
    );
  }
  await assertTransitionPermission(tx, principal, order, input.newStatus);
  const expectedVersion = input.expectedVersion ?? order.version;
  const now = new Date();
  const update = await tx.order.updateMany({
    data: {
      ...(input.newStatus === OrderStatus.CONFIRMED
        ? { confirmedAt: now }
        : {}),
      ...(input.newStatus === OrderStatus.DELIVERED
        ? { deliveredAt: now }
        : {}),
      ...(input.newStatus === OrderStatus.CANCELLED
        ? {
            cancellationNote: input.note ?? null,
            cancellationReasonCode: input.cancellationReasonCode ?? null,
            cancelledAt: now,
          }
        : {}),
      status: input.newStatus,
      version: { increment: 1 },
    },
    where: { id: order.id, status: order.status, version: expectedVersion },
  });
  if (update.count !== 1) {
    throw new MarketplaceError(
      "INVALID_ORDER_TRANSITION",
      "Заказ уже был изменён другим процессом",
      409,
    );
  }
  if (input.newStatus === OrderStatus.CANCELLED) {
    await releaseReservations(tx, order.id);
    const payment = await tx.payment.findUnique({
      where: { orderId: order.id },
    });
    if (
      payment &&
      payment.status !== PaymentStatus.CANCELLED &&
      payment.status !== PaymentStatus.REFUNDED
    ) {
      const refund =
        payment.method === PaymentMethod.TEST &&
        (payment.status === PaymentStatus.AUTHORIZED ||
          payment.status === PaymentStatus.PAID);
      await tx.payment.update({
        data: refund
          ? { refundedAt: now, status: PaymentStatus.REFUNDED }
          : { cancelledAt: now, status: PaymentStatus.CANCELLED },
        where: { id: payment.id },
      });
    }
  } else if (input.newStatus === OrderStatus.DELIVERED) {
    await consumeReservations(tx, order.id);
  }
  await tx.orderStatusHistory.create({
    data: {
      actorType: principal.actorType,
      changedByUserId: principal.userId,
      newStatus: input.newStatus,
      note: input.note ?? null,
      orderId: order.id,
      previousStatus: order.status,
      source: input.source ?? OrderStatusSource.API,
    },
  });
  if (principal.userId) {
    await tx.auditLog.create({
      data: {
        action: "order.status_changed",
        actorRole: principal.actorType,
        actorUserId: principal.userId,
        afterRedacted: { status: input.newStatus },
        beforeRedacted: { status: order.status },
        reason: input.cancellationReasonCode ?? input.note ?? null,
        requestId: input.requestId ?? null,
        subjectId: order.id,
        subjectType: "Order",
      },
    });
  }
  return tx.order.findUniqueOrThrow({ where: { id: order.id } });
}

export async function transitionOrder(
  actor: ActorContext,
  input: TransitionOrderInput,
) {
  return prisma.$transaction(
    (tx) => transitionOrderInTransaction(tx, principalFromActor(actor), input),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
