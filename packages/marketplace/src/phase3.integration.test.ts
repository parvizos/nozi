import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { buildActorContext, Permission, type ActorContext } from "@nozi/auth";
import {
  CartStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
  ProductStatus,
  UserRoleCode,
  UserStatus,
  prisma,
  seedMarketplace,
} from "@nozi/database";

import { addCartItem, getCart, removeCartItem, updateCartItem } from "./cart";
import type { CheckoutInput } from "./checkout-contracts";
import { placeOrder } from "./checkout";
import { MarketplaceError } from "./errors";
import { transitionOrder } from "./order-state-machine";
import { getCustomerOrder } from "./orders";

function actor(
  userId: string,
  role: UserRoleCode = UserRoleCode.CUSTOMER,
): ActorContext {
  return buildActorContext({
    explicitPermissions:
      role === UserRoleCode.ADMIN ? [Permission.OrdersManage] : [],
    roles: [role],
    status: UserStatus.ACTIVE,
    userId,
  });
}

async function createUser(
  role: UserRoleCode = UserRoleCode.CUSTOMER,
): Promise<ActorContext> {
  const id = randomUUID();
  await prisma.user.create({
    data: {
      email: `phase3-${role.toLowerCase()}-${id}@nozi.test`,
      id,
      name: `Phase 3 ${role}`,
    },
  });
  return actor(id, role);
}

function futureDate(days = 2): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function checkoutInput(paymentMethod: "CASH" | "TEST" = "TEST"): CheckoutInput {
  return {
    anonymousDelivery: false,
    apartment: undefined,
    buyerName: "Муниса Каримова",
    buyerPhone: "+992900001234",
    customerNote: undefined,
    deliveryAddress: "проспект Рудаки, 100",
    deliveryDate: futureDate(),
    deliveryNote: undefined,
    deliveryWindowEnd: "14:00",
    deliveryWindowStart: "12:00",
    entrance: undefined,
    floor: undefined,
    giftMessage: "С теплом от NOZI",
    paymentMethod,
    recipientName: "Ситора Саидова",
    recipientPhone: "+992900005678",
  };
}

async function productFixture(slug: string) {
  return prisma.product.findUniqueOrThrow({
    include: {
      variants: { orderBy: { sortOrder: "asc" }, where: { isActive: true } },
    },
    where: { slug },
  });
}

beforeAll(async () => {
  await seedMarketplace();
  await prisma.store.updateMany({
    data: { isOpen: true, isTemporarilyPaused: false },
  });
});

describe.sequential("database-backed cart", () => {
  it("adds, reprices, updates and removes an owned item", async () => {
    const customer = await createUser();
    const product = await productFixture("bouquets-2-nozi");
    const variant = product.variants[0];
    if (!variant) throw new Error("Seed variant missing");

    const added = await addCartItem(customer, {
      productId: product.id,
      productVariantId: variant.id,
      quantity: 1,
    });
    expect(added.items).toHaveLength(1);
    expect(added.items[0]?.unitPrice).toBe(product.price.toFixed(2));

    const updated = await updateCartItem(customer, added.items[0]!.id, {
      quantity: 2,
    });
    expect(updated.items[0]?.quantity).toBe(2);
    expect(updated.subtotal).toBe(product.price.mul(2).toFixed(2));

    await expect(
      removeCartItem(customer, updated.items[0]!.id),
    ).resolves.toMatchObject({ items: [] });
  });

  it("rejects products from another store without replacing the cart", async () => {
    const customer = await createUser();
    const first = await productFixture("bouquets-1-nozi");
    const other = await prisma.product.findFirstOrThrow({
      include: { variants: { where: { isActive: true } } },
      where: { status: ProductStatus.ACTIVE, storeId: { not: first.storeId } },
    });
    await addCartItem(customer, {
      productId: first.id,
      productVariantId: first.variants[0]!.id,
      quantity: 1,
    });

    await expect(
      addCartItem(customer, {
        productId: other.id,
        productVariantId: other.variants[0]!.id,
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: "CART_STORE_CONFLICT", status: 409 });
    await expect(getCart(customer)).resolves.toMatchObject({
      store: { id: first.storeId },
    });
  });

  it("validates stock and enforces cart object ownership", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const product = await productFixture("gifts-8-nozi");
    const variant = product.variants[0]!;
    const cart = await addCartItem(owner, {
      productId: product.id,
      productVariantId: variant.id,
      quantity: 1,
    });

    await expect(
      updateCartItem(owner, cart.items[0]!.id, {
        quantity: variant.stockQuantity + 1,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    await expect(
      updateCartItem(stranger, cart.items[0]!.id, { quantity: 1 }),
    ).rejects.toMatchObject({ code: "CART_ITEM_NOT_FOUND", status: 404 });
    await expect(getCart(stranger)).resolves.toBeNull();
  });
});

describe.sequential("transactional checkout", () => {
  it("recalculates trusted prices and commits immutable snapshots, payment, commission and history", async () => {
    const customer = await createUser();
    const product = await productFixture("gift-boxes-3-nozi");
    const variant = product.variants[0]!;
    await addCartItem(customer, {
      productId: product.id,
      productVariantId: variant.id,
      quantity: 2,
    });
    const newPrice = product.price.add(11);
    await prisma.product.update({
      data: { price: newPrice },
      where: { id: product.id },
    });

    try {
      const result = await placeOrder(customer, checkoutInput("TEST"), {
        idempotencyKey: `checkout-${randomUUID()}`,
        requestId: randomUUID(),
      });
      expect(result.created).toBe(true);
      expect(result.status).toBe(OrderStatus.AWAITING_SELLER_CONFIRMATION);
      const order = await prisma.order.findUniqueOrThrow({
        include: {
          commission: true,
          inventoryReservations: true,
          items: true,
          payment: true,
          statusHistory: true,
        },
        where: { id: result.orderId },
      });
      expect(order.items[0]?.unitPrice.toFixed(2)).toBe(newPrice.toFixed(2));
      expect(order.items[0]?.productName).toBe(product.name);
      expect(order.itemsSubtotal.toFixed(2)).toBe(newPrice.mul(2).toFixed(2));
      expect(order.payment?.status).toBe(PaymentStatus.PAID);
      expect(order.commission).not.toBeNull();
      expect(order.inventoryReservations).toHaveLength(1);
      expect(order.statusHistory.map(({ newStatus }) => newStatus)).toEqual([
        OrderStatus.CREATED,
        OrderStatus.AWAITING_SELLER_CONFIRMATION,
      ]);
      await expect(
        prisma.cart.findFirstOrThrow({
          where: { customerUserId: customer.userId },
        }),
      ).resolves.toMatchObject({ status: CartStatus.CONVERTED });

      await prisma.product.update({
        data: { name: "Изменённое имя", price: newPrice.add(50) },
        where: { id: product.id },
      });
      const snapshot = await prisma.orderItem.findFirstOrThrow({
        where: { orderId: order.id },
      });
      expect(snapshot.productName).toBe(product.name);
      expect(snapshot.unitPrice.toFixed(2)).toBe(newPrice.toFixed(2));
    } finally {
      await prisma.product.update({
        data: { name: product.name, price: product.price },
        where: { id: product.id },
      });
    }
  });

  it("returns the same order for the same idempotency key", async () => {
    const customer = await createUser();
    const product = await productFixture("flowers-6-premium");
    await addCartItem(customer, {
      productId: product.id,
      productVariantId: product.variants[0]!.id,
      quantity: 1,
    });
    const input = checkoutInput("CASH");
    const key = `checkout-${randomUUID()}`;
    const first = await placeOrder(customer, input, {
      idempotencyKey: key,
      requestId: randomUUID(),
    });
    const second = await placeOrder(customer, input, {
      idempotencyKey: key,
      requestId: randomUUID(),
    });

    expect(second).toMatchObject({
      created: false,
      orderId: first.orderId,
      orderNumber: first.orderNumber,
    });
    await expect(
      prisma.order.count({ where: { customerUserId: customer.userId } }),
    ).resolves.toBe(1);
  });

  it("rolls back checkout when a cart product becomes invalid", async () => {
    const customer = await createUser();
    const product = await productFixture("balloons-5-nozi");
    await addCartItem(customer, {
      productId: product.id,
      productVariantId: product.variants[0]!.id,
      quantity: 1,
    });
    await prisma.product.update({
      data: { status: ProductStatus.HIDDEN },
      where: { id: product.id },
    });
    try {
      await expect(
        placeOrder(customer, checkoutInput(), {
          idempotencyKey: `checkout-${randomUUID()}`,
          requestId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "PRODUCT_UNAVAILABLE" });
      await expect(
        prisma.order.count({ where: { customerUserId: customer.userId } }),
      ).resolves.toBe(0);
      await expect(
        prisma.cart.findFirstOrThrow({
          where: { customerUserId: customer.userId },
        }),
      ).resolves.toMatchObject({ status: CartStatus.ACTIVE });
    } finally {
      await prisma.product.update({
        data: { status: ProductStatus.ACTIVE },
        where: { id: product.id },
      });
    }
  });

  it("prevents overselling the final available unit under concurrent checkout", async () => {
    const [firstCustomer, secondCustomer] = await Promise.all([
      createUser(),
      createUser(),
    ]);
    const product = await productFixture("cakes-sweets-5-nozi");
    const variant = product.variants[0]!;
    await prisma.$transaction([
      prisma.product.update({
        data: {
          price: new Prisma.Decimal(120),
          reservedQuantity: 0,
          stockQuantity: 1,
        },
        where: { id: product.id },
      }),
      prisma.productVariant.update({
        data: { reservedQuantity: 0, stockQuantity: 1 },
        where: { id: variant.id },
      }),
    ]);
    await addCartItem(firstCustomer, {
      productId: product.id,
      productVariantId: variant.id,
      quantity: 1,
    });
    await addCartItem(secondCustomer, {
      productId: product.id,
      productVariantId: variant.id,
      quantity: 1,
    });
    const results = await Promise.allSettled([
      placeOrder(firstCustomer, checkoutInput(), {
        idempotencyKey: `checkout-${randomUUID()}`,
        requestId: randomUUID(),
      }),
      placeOrder(secondCustomer, checkoutInput(), {
        idempotencyKey: `checkout-${randomUUID()}`,
        requestId: randomUUID(),
      }),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    const reserved = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    });
    expect(reserved.reservedQuantity).toBe(1);

    const successful = results.find((result) => result.status === "fulfilled");
    if (successful?.status === "fulfilled") {
      const admin = await createUser(UserRoleCode.ADMIN);
      await transitionOrder(admin, {
        newStatus: OrderStatus.CANCELLED,
        orderId: successful.value.orderId,
      });
    }
    await prisma.$transaction([
      prisma.product.update({
        data: {
          price: product.price,
          reservedQuantity: product.reservedQuantity,
          stockQuantity: product.stockQuantity,
        },
        where: { id: product.id },
      }),
      prisma.productVariant.update({
        data: {
          reservedQuantity: variant.reservedQuantity,
          stockQuantity: variant.stockQuantity,
        },
        where: { id: variant.id },
      }),
    ]);
  });

  it("does not expose an order to another customer", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const product = await productFixture("gifts-4-sand");
    await addCartItem(owner, {
      productId: product.id,
      productVariantId: product.variants[0]!.id,
      quantity: 1,
    });
    const result = await placeOrder(owner, checkoutInput(), {
      idempotencyKey: `checkout-${randomUUID()}`,
      requestId: randomUUID(),
    });

    await expect(
      getCustomerOrder(owner, result.orderNumber),
    ).resolves.toMatchObject({ orderNumber: result.orderNumber });
    await expect(
      getCustomerOrder(stranger, result.orderNumber),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND", status: 404 });
  });
});

describe.sequential("order state machine", () => {
  it("accepts valid transitions, rejects invalid jumps and writes history", async () => {
    const customer = await createUser();
    const admin = await createUser(UserRoleCode.ADMIN);
    const product = await productFixture("bouquets-8-nozi");
    await addCartItem(customer, {
      productId: product.id,
      productVariantId: product.variants[0]!.id,
      quantity: 1,
    });
    const result = await placeOrder(customer, checkoutInput(), {
      idempotencyKey: `checkout-${randomUUID()}`,
      requestId: randomUUID(),
    });

    await expect(
      transitionOrder(admin, {
        newStatus: OrderStatus.CONFIRMED,
        note: "Verified test order",
        orderId: result.orderId,
      }),
    ).resolves.toMatchObject({ status: OrderStatus.CONFIRMED });
    await expect(
      transitionOrder(admin, {
        newStatus: OrderStatus.DELIVERED,
        orderId: result.orderId,
      }),
    ).rejects.toBeInstanceOf(MarketplaceError);
    await expect(
      transitionOrder(admin, {
        newStatus: OrderStatus.PREPARING,
        orderId: result.orderId,
      }),
    ).resolves.toMatchObject({ status: OrderStatus.PREPARING });
    const history = await prisma.orderStatusHistory.findMany({
      orderBy: { createdAt: "asc" },
      where: { orderId: result.orderId },
    });
    expect(history.map(({ newStatus }) => newStatus)).toEqual([
      OrderStatus.CREATED,
      OrderStatus.AWAITING_SELLER_CONFIRMATION,
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
    ]);
  });
});
