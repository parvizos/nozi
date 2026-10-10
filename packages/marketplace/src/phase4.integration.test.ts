import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

import { buildActorContext, Permission, type ActorContext } from "@nozi/auth";
import {
  InventoryReservationStatus,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  SellerUserRole,
  UserRoleCode,
  UserStatus,
  prisma,
  seedMarketplace,
} from "@nozi/database";

import { addCartItem } from "./cart";
import { placeOrder } from "./checkout";
import type { CheckoutInput } from "./checkout-contracts";
import {
  archiveSellerProduct,
  createSellerProduct,
  getSellerOrder,
  listSellerOrders,
  sellerTransitionOrder,
  updateSellerProduct,
  updateSellerStore,
} from "./seller";
import { sellerStoreUpdateSchema } from "./seller-contracts";
import { moderateProduct } from "./admin";
import { getProductBySlug } from "./catalog";

function actor(userId: string, role: UserRoleCode): ActorContext {
  return buildActorContext({
    roles: [role],
    status: UserStatus.ACTIVE,
    userId,
  });
}

async function createUser(role: UserRoleCode): Promise<ActorContext> {
  const id = randomUUID();
  await prisma.user.create({
    data: { email: `phase4-${id}@nozi.test`, id, name: `Phase 4 ${role}` },
  });
  return actor(id, role);
}

async function sellerActor(sellerId: string, sellerRole: SellerUserRole) {
  const seller = await createUser(UserRoleCode.SELLER);
  await prisma.sellerUser.create({
    data: { sellerId, sellerRole, userId: seller.userId },
  });
  return seller;
}

function checkoutInput(): CheckoutInput {
  return {
    anonymousDelivery: false,
    apartment: undefined,
    buyerName: "Phase Four Buyer",
    buyerPhone: "+992900001234",
    customerNote: "Позвонить перед доставкой",
    deliveryAddress: "проспект Рудаки, 101",
    deliveryDate: new Date(Date.now() + 172_800_000).toISOString().slice(0, 10),
    deliveryNote: undefined,
    deliveryWindowEnd: "15:00",
    deliveryWindowStart: "13:00",
    entrance: undefined,
    floor: undefined,
    giftMessage: "Поздравляю!",
    paymentMethod: "TEST",
    recipientName: "Мадина",
    recipientPhone: "+992900005678",
  };
}

async function placedOrder(productId: string, variantId: string) {
  const product = await prisma.product.findUniqueOrThrow({
    select: { store: { select: { id: true, sellerId: true } } },
    where: { id: productId },
  });
  await prisma.$transaction([
    prisma.seller.update({
      data: { status: "APPROVED" },
      where: { id: product.store.sellerId },
    }),
    prisma.store.update({
      data: {
        isActive: true,
        isOpen: true,
        isTemporarilyPaused: false,
        status: "ACTIVE",
      },
      where: { id: product.store.id },
    }),
    prisma.product.update({
      data: { stockQuantity: 10_000 },
      where: { id: productId },
    }),
    prisma.productVariant.update({
      data: { stockQuantity: 10_000 },
      where: { id: variantId },
    }),
  ]);
  const customer = await createUser(UserRoleCode.CUSTOMER);
  await addCartItem(customer, {
    productId,
    productVariantId: variantId,
    quantity: 2,
  });
  const result = await placeOrder(customer, checkoutInput(), {
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
  });
  return prisma.order.findUniqueOrThrow({ where: { id: result.orderId } });
}

beforeAll(async () => {
  await seedMarketplace();
});

describe.sequential("seller order scope and transitions", () => {
  it("lists and opens only orders from the seller's stores", async () => {
    const product = await prisma.product.findFirstOrThrow({
      include: { store: true, variants: { take: 1 } },
      where: {
        status: ProductStatus.ACTIVE,
        variants: { some: { deletedAt: null, isActive: true } },
      },
    });
    const other = await prisma.product.findFirstOrThrow({
      include: { store: true, variants: { take: 1 } },
      where: {
        status: ProductStatus.ACTIVE,
        storeId: { not: product.storeId },
      },
    });
    const seller = await sellerActor(
      product.store.sellerId,
      SellerUserRole.OPERATOR,
    );
    const ownOrder = await placedOrder(product.id, product.variants[0]!.id);
    const otherOrder = await placedOrder(other.id, other.variants[0]!.id);
    const orders = await listSellerOrders(seller, {
      page: 1,
      pageSize: 20,
      status: "ALL",
    });
    expect(
      orders.items.some((order) => order.orderNumber === ownOrder.orderNumber),
    ).toBe(true);
    expect(
      orders.items.some(
        (order) => order.orderNumber === otherOrder.orderNumber,
      ),
    ).toBe(false);
    await expect(
      getSellerOrder(seller, otherOrder.orderNumber),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("accepts once under concurrent clicks and continues only through seller transitions", async () => {
    const product = await prisma.product.findFirstOrThrow({
      include: { store: true, variants: { take: 1 } },
      where: { status: ProductStatus.ACTIVE },
    });
    const seller = await sellerActor(
      product.store.sellerId,
      SellerUserRole.OPERATOR,
    );
    const order = await placedOrder(product.id, product.variants[0]!.id);
    const results = await Promise.allSettled([
      sellerTransitionOrder(seller, order.orderNumber, {
        expectedVersion: order.version,
        newStatus: OrderStatus.CONFIRMED,
      }),
      sellerTransitionOrder(seller, order.orderNumber, {
        expectedVersion: order.version,
        newStatus: OrderStatus.CONFIRMED,
      }),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(
      await prisma.orderStatusHistory.count({
        where: { newStatus: OrderStatus.CONFIRMED, orderId: order.id },
      }),
    ).toBe(1);
    await expect(
      sellerTransitionOrder(seller, order.orderNumber, {
        newStatus: OrderStatus.DELIVERED,
      }),
    ).rejects.toMatchObject({ code: "INVALID_ORDER_TRANSITION" });
    await sellerTransitionOrder(seller, order.orderNumber, {
      newStatus: OrderStatus.PREPARING,
    });
    const ready = await sellerTransitionOrder(seller, order.orderNumber, {
      newStatus: OrderStatus.READY_FOR_PICKUP,
    });
    expect(ready.status).toBe(OrderStatus.READY_FOR_PICKUP);
  });

  it("rejects with a reason, releases inventory once and refunds TEST payment", async () => {
    const product = await prisma.product.findFirstOrThrow({
      include: { store: true, variants: { take: 1 } },
      where: { status: ProductStatus.ACTIVE },
    });
    const seller = await sellerActor(
      product.store.sellerId,
      SellerUserRole.OPERATOR,
    );
    const order = await placedOrder(product.id, product.variants[0]!.id);
    const before = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    await sellerTransitionOrder(seller, order.orderNumber, {
      newStatus: OrderStatus.CANCELLED,
      note: "Свежая поставка задерживается",
      reason: "OUT_OF_STOCK",
    });
    const [cancelled, after, reservation, payment] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
      prisma.inventoryReservation.findFirstOrThrow({
        where: { orderId: order.id },
      }),
      prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } }),
    ]);
    expect(cancelled.cancellationReasonCode).toBe("OUT_OF_STOCK");
    expect(after.reservedQuantity).toBe(
      before.reservedQuantity - reservation.quantity,
    );
    expect(reservation.status).toBe(InventoryReservationStatus.RELEASED);
    expect(payment.status).toBe(PaymentStatus.REFUNDED);
    await expect(
      sellerTransitionOrder(seller, order.orderNumber, {
        newStatus: OrderStatus.CANCELLED,
        reason: "OTHER",
      }),
    ).rejects.toMatchObject({ code: "INVALID_ORDER_TRANSITION" });
  });
});

describe.sequential("seller product and store permissions", () => {
  it("keeps an ACTIVE version live while sensitive edits await moderation", async () => {
    const store = await prisma.store.findFirstOrThrow();
    const owner = await sellerActor(store.sellerId, SellerUserRole.OWNER);
    const category = await prisma.category.findFirstOrThrow({
      where: { isActive: true },
    });
    const base = {
      categoryId: category.id,
      compareAtPrice: null,
      description: "Пилотный подарок с безопасной проверкой изменений.",
      images: [],
      name: "Moderation Pilot Gift",
      preparationTimeMinutes: 30,
      price: "149.50",
      slug: `moderation-pilot-${randomUUID()}`,
      status: ProductStatus.PENDING_REVIEW,
      stockQuantity: 8,
      storeId: store.id,
      variants: [],
    };
    const product = await createSellerProduct(owner, base);
    const adminUser = await createUser(UserRoleCode.ADMIN);
    const admin = buildActorContext({
      explicitPermissions: [
        Permission.AdminAccess,
        Permission.ProductsModerate,
      ],
      roles: [UserRoleCode.ADMIN],
      status: UserStatus.ACTIVE,
      userId: adminUser.userId,
    });
    await moderateProduct(admin, product.id, {
      note: "Public description needs a clearer composition",
      status: ProductStatus.REJECTED,
    });
    await expect(
      prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
    ).resolves.toMatchObject({
      moderationNote: "Public description needs a clearer composition",
      status: ProductStatus.REJECTED,
    });
    const rejected = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    base.description =
      "Пилотный подарок с уточнённым составом для безопасной проверки.";
    await updateSellerProduct(owner, product.id, {
      ...base,
      status: ProductStatus.PENDING_REVIEW,
      version: rejected.version,
    });
    await moderateProduct(admin, product.id, { status: ProductStatus.ACTIVE });
    const live = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    await updateSellerProduct(owner, product.id, {
      ...base,
      status: ProductStatus.DRAFT,
      stockQuantity: 11,
      version: live.version,
    });
    await expect(
      prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
    ).resolves.toMatchObject({
      status: ProductStatus.ACTIVE,
      stockQuantity: 11,
    });
    const operational = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    await updateSellerProduct(owner, product.id, {
      ...base,
      name: "Moderation Pilot Gift Revised",
      status: ProductStatus.PENDING_REVIEW,
      stockQuantity: 11,
      version: operational.version,
    });
    await expect(getProductBySlug(base.slug)).resolves.toMatchObject({
      name: base.name,
    });
    await expect(
      prisma.productRevision.findFirstOrThrow({
        where: { productId: product.id },
      }),
    ).resolves.toMatchObject({ status: "PENDING_REVIEW" });
    await moderateProduct(admin, product.id, { status: ProductStatus.ACTIVE });
    await expect(getProductBySlug(base.slug)).resolves.toMatchObject({
      name: "Moderation Pilot Gift Revised",
    });
  });

  it("allows a manager to create, edit and archive a scoped product", async () => {
    const store = await prisma.store.findFirstOrThrow();
    const manager = await sellerActor(store.sellerId, SellerUserRole.MANAGER);
    const category = await prisma.category.findFirstOrThrow({
      where: { isActive: true },
    });
    const input = {
      categoryId: category.id,
      compareAtPrice: null,
      description: "Авторский подарок для интеграционного теста NOZI.",
      images: [
        {
          altText: "Test gift",
          isPrimary: true,
          objectKey: "/images/products/gifts.svg",
          sortOrder: 0,
        },
      ],
      name: "Phase Four Gift",
      preparationTimeMinutes: 45,
      price: "120.00",
      slug: `phase-four-${randomUUID()}`,
      status: ProductStatus.DRAFT,
      stockQuantity: 4,
      storeId: store.id,
      variants: [
        {
          absolutePrice: null,
          isActive: true,
          name: "Стандарт",
          priceDelta: "0.00",
          sku: null,
          sortOrder: 0,
          stockQuantity: 4,
        },
      ],
    };
    const product = await createSellerProduct(manager, input);
    const edited = await updateSellerProduct(manager, product.id, {
      ...input,
      name: "Phase Four Gift Updated",
      status: ProductStatus.PENDING_REVIEW,
      stockQuantity: 6,
      version: product.version,
    });
    expect(edited.name).toBe("Phase Four Gift Updated");
    expect((await archiveSellerProduct(manager, product.id)).status).toBe(
      ProductStatus.ARCHIVED,
    );
  });

  it("blocks operators and cross-seller product mutations", async () => {
    const stores = await prisma.store.findMany({
      orderBy: { createdAt: "asc" },
      take: 2,
    });
    const own = stores[0]!;
    const other = stores[1]!;
    const operator = await sellerActor(own.sellerId, SellerUserRole.OPERATOR);
    const category = await prisma.category.findFirstOrThrow();
    const foreignProduct = await prisma.product.findFirstOrThrow({
      where: { storeId: other.id },
    });
    const input = {
      categoryId: category.id,
      compareAtPrice: null,
      description: "Достаточно длинное описание защищённого товара.",
      images: [],
      name: "Forbidden Gift",
      preparationTimeMinutes: 30,
      price: "90.00",
      slug: `forbidden-${randomUUID()}`,
      status: ProductStatus.DRAFT,
      stockQuantity: 2,
      storeId: own.id,
      variants: [],
    };
    await expect(createSellerProduct(operator, input)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    await expect(
      archiveSellerProduct(operator, foreignProduct.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("keeps physical stock at or above reservations", async () => {
    const product = await prisma.product.findFirstOrThrow({
      include: { store: true, variants: { take: 1 } },
      where: { status: ProductStatus.ACTIVE },
    });
    const owner = await sellerActor(
      product.store.sellerId,
      SellerUserRole.OWNER,
    );
    await placedOrder(product.id, product.variants[0]!.id);
    const current = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    const category = await prisma.category.findUniqueOrThrow({
      where: { id: current.categoryId },
    });
    await expect(
      updateSellerProduct(owner, current.id, {
        categoryId: category.id,
        compareAtPrice: current.compareAtPrice?.toFixed(2) ?? null,
        description: current.description,
        images: [],
        name: current.name,
        preparationTimeMinutes: current.preparationTimeMinutes,
        price: current.price.toFixed(2),
        slug: current.slug,
        status: ProductStatus.PENDING_REVIEW,
        stockQuantity: current.reservedQuantity - 1,
        storeId: current.storeId,
        variants: [],
        version: current.version,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
  });

  it("updates only seller-controlled store fields and writes an audit record", async () => {
    const store = await prisma.store.findFirstOrThrow();
    const owner = await sellerActor(store.sellerId, SellerUserRole.OWNER);
    const input = sellerStoreUpdateSchema.parse({
      commission: 99,
      defaultPreparationMinutes: 50,
      deliveryFeeAmount: "30.00",
      description: `${store.description} Обновлено.`,
      isOpen: true,
      isTemporarilyPaused: false,
      minimumOrderAmount: "95.00",
      name: store.name,
      openingHours: Array.from({ length: 7 }, (_, i) => ({
        closesAt: "20:00",
        dayOfWeek: i + 1,
        isClosed: false,
        opensAt: "09:00",
      })),
      pauseReason: null,
      phoneE164: store.phoneE164,
    });
    expect("commission" in input).toBe(false);
    await updateSellerStore(owner, store.id, input, "phase4-test");
    expect(
      await prisma.auditLog.count({
        where: {
          action: "store.updated",
          actorUserId: owner.userId,
          subjectId: store.id,
        },
      }),
    ).toBeGreaterThan(0);
  });
});
