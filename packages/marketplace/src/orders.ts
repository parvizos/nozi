import { assertRole, type ActorContext } from "@nozi/auth";
import { UserRoleCode, prisma } from "@nozi/database";
import type { Prisma } from "@nozi/database";

import { MarketplaceError } from "./errors";

const orderInclude = {
  deliveryAddress: true,
  items: { orderBy: { createdAt: "asc" as const } },
  payment: true,
  statusHistory: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  },
  store: {
    select: {
      logoObjectKey: true,
      name: true,
      phoneE164: true,
      slug: true,
    },
  },
} satisfies Prisma.OrderInclude;

type OrderRecord = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

function assertCustomer(actor: ActorContext): void {
  assertRole(actor, [UserRoleCode.CUSTOMER]);
}

function serializeOrder(order: OrderRecord) {
  return {
    ...order,
    createdAt: order.createdAt.toISOString(),
    deliveryAddress: order.deliveryAddress
      ? {
          ...order.deliveryAddress,
          createdAt: order.deliveryAddress.createdAt.toISOString(),
          latitude: order.deliveryAddress.latitude?.toFixed(6) ?? null,
          longitude: order.deliveryAddress.longitude?.toFixed(6) ?? null,
        }
      : null,
    deliveryFee: order.deliveryFee.toFixed(2),
    discountTotal: order.discountTotal.toFixed(2),
    grandTotal: order.grandTotal.toFixed(2),
    items: order.items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      lineTotal: item.lineTotal.toFixed(2),
      unitPrice: item.unitPrice.toFixed(2),
    })),
    itemsSubtotal: order.itemsSubtotal.toFixed(2),
    payment: order.payment
      ? {
          method: order.payment.method,
          status: order.payment.status,
        }
      : null,
    requestedDeliveryDate: order.requestedDeliveryDate
      .toISOString()
      .slice(0, 10),
    requestedDeliveryWindowEnd: order.requestedDeliveryWindowEnd
      .toISOString()
      .slice(11, 16),
    requestedDeliveryWindowStart: order.requestedDeliveryWindowStart
      .toISOString()
      .slice(11, 16),
    statusHistory: order.statusHistory.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
    })),
    updatedAt: order.updatedAt.toISOString(),
  };
}

export type CustomerOrderView = ReturnType<typeof serializeOrder>;

function findOrder(customerUserId: string, orderNumber: string) {
  return prisma.order.findFirst({
    include: orderInclude,
    where: { customerUserId, orderNumber },
  });
}

export async function getCustomerOrder(
  actor: ActorContext,
  orderNumber: string,
) {
  assertCustomer(actor);
  const order = await findOrder(actor.userId, orderNumber);
  if (!order) {
    throw new MarketplaceError("ORDER_NOT_FOUND", "Заказ не найден", 404);
  }
  return serializeOrder(order);
}

export async function listCustomerOrders(actor: ActorContext) {
  assertCustomer(actor);
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      currencyCode: true,
      grandTotal: true,
      items: { select: { imageObjectKey: true }, take: 3 },
      orderNumber: true,
      status: true,
      store: { select: { name: true, slug: true } },
    },
    take: 50,
    where: { customerUserId: actor.userId },
  });
  return orders.map((order) => ({
    ...order,
    createdAt: order.createdAt.toISOString(),
    grandTotal: order.grandTotal.toFixed(2),
  }));
}
