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
    anonymousDelivery: order.anonymousDelivery,
    createdAt: order.createdAt.toISOString(),
    currencyCode: order.currencyCode,
    deliveryAddress: order.deliveryAddress
      ? {
          apartment: order.deliveryAddress.apartment,
          cityName: order.deliveryAddress.cityName,
          countryCode: order.deliveryAddress.countryCode,
          deliveryNote: order.deliveryAddress.deliveryNote,
          entrance: order.deliveryAddress.entrance,
          floor: order.deliveryAddress.floor,
          latitude: order.deliveryAddress.latitude?.toFixed(6) ?? null,
          line1: order.deliveryAddress.line1,
          longitude: order.deliveryAddress.longitude?.toFixed(6) ?? null,
        }
      : null,
    deliveryFee: order.deliveryFee.toFixed(2),
    discountTotal: order.discountTotal.toFixed(2),
    giftMessage: order.giftMessage,
    grandTotal: order.grandTotal.toFixed(2),
    items: order.items.map((item) => ({
      currencyCode: item.currencyCode,
      id: item.id,
      imageObjectKey: item.imageObjectKey,
      lineTotal: item.lineTotal.toFixed(2),
      productName: item.productName,
      quantity: item.quantity,
      sku: item.sku,
      unitPrice: item.unitPrice.toFixed(2),
      variantName: item.variantName,
    })),
    itemsSubtotal: order.itemsSubtotal.toFixed(2),
    orderNumber: order.orderNumber,
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
    recipientName: order.recipientName,
    recipientPhoneE164: order.recipientPhoneE164,
    status: order.status,
    statusHistory: order.statusHistory.map((entry) => ({
      createdAt: entry.createdAt.toISOString(),
      id: entry.id,
      newStatus: entry.newStatus,
      previousStatus: entry.previousStatus,
    })),
    store: {
      logoObjectKey: order.store.logoObjectKey,
      name: order.store.name,
      phoneE164: order.store.phoneE164,
      slug: order.store.slug,
    },
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
