import { AuthorizationError, type ActorContext } from "@nozi/auth";
import {
  OrderStatus,
  Prisma,
  ProductRevisionStatus,
  ProductStatus,
  prisma,
} from "@nozi/database";

import { MarketplaceError } from "./errors";
import {
  SellerPermission,
  assertSellerStoreAccess,
  requireSellerWorkspace,
} from "./seller-access";
import type {
  SellerOrderFilter,
  SellerProductFilter,
  SellerProductInput,
  SellerStoreUpdate,
} from "./seller-contracts";
import { transitionOrder } from "./order-state-machine";
import { DevelopmentObjectStorageProvider } from "./storage";
import { dushanbeDayRange } from "./timezone";

const objectStorage = new DevelopmentObjectStorageProvider();

function validateImageMetadata(images: SellerProductInput["images"]): void {
  try {
    for (const image of images) {
      objectStorage.validateMetadata({ key: image.objectKey });
    }
  } catch {
    throw new MarketplaceError(
      "VALIDATION_ERROR",
      "Некорректный ключ изображения",
      400,
    );
  }
}

function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function revisionStatus(
  status: SellerProductInput["status"],
): ProductRevisionStatus {
  return status === ProductStatus.PENDING_REVIEW
    ? ProductRevisionStatus.PENDING_REVIEW
    : ProductRevisionStatus.DRAFT;
}

function sensitiveProductSnapshot(input: SellerProductInput) {
  return {
    categoryId: input.categoryId,
    compareAtPrice: input.compareAtPrice ?? null,
    description: input.description,
    images: input.images.map(
      ({ altText, isPrimary, objectKey, sortOrder }) => ({
        altText,
        isPrimary,
        objectKey,
        sortOrder,
      }),
    ),
    name: input.name,
    price: input.price,
    slug: input.slug,
    variants: input.variants.map(
      ({ absolutePrice, id, name, priceDelta, sku, sortOrder }) => ({
        absolutePrice: absolutePrice ?? null,
        id: id ?? null,
        name,
        priceDelta,
        sku: sku ?? null,
        sortOrder,
      }),
    ),
  };
}

function currentSensitiveSnapshot(current: {
  categoryId: string;
  compareAtPrice: Prisma.Decimal | null;
  description: string;
  images: {
    altText: string;
    isPrimary: boolean;
    objectKey: string;
    sortOrder: number;
  }[];
  name: string;
  price: Prisma.Decimal;
  slug: string;
  variants: {
    absolutePrice: Prisma.Decimal | null;
    deletedAt: Date | null;
    id: string;
    name: string;
    priceDelta: Prisma.Decimal;
    sku: string | null;
    sortOrder: number;
  }[];
}) {
  return {
    categoryId: current.categoryId,
    compareAtPrice: current.compareAtPrice?.toFixed(2) ?? null,
    description: current.description,
    images: current.images.map(
      ({ altText, isPrimary, objectKey, sortOrder }) => ({
        altText,
        isPrimary,
        objectKey,
        sortOrder,
      }),
    ),
    name: current.name,
    price: current.price.toFixed(2),
    slug: current.slug,
    variants: current.variants
      .filter(({ deletedAt }) => !deletedAt)
      .map(({ absolutePrice, id, name, priceDelta, sku, sortOrder }) => ({
        absolutePrice: absolutePrice?.toFixed(2) ?? null,
        id,
        name,
        priceDelta: priceDelta.toFixed(2),
        sku,
        sortOrder,
      })),
  };
}

async function audit(
  tx: Prisma.TransactionClient,
  actor: ActorContext,
  input: {
    action: string;
    after?: Prisma.InputJsonValue;
    before?: Prisma.InputJsonValue;
    reason?: string | undefined;
    requestId?: string | undefined;
    subjectId: string;
    subjectType: string;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      action: input.action,
      actorRole: "SELLER",
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

export async function getSellerShell(actor: ActorContext) {
  const { memberships, storeIds } = await requireSellerWorkspace(actor);
  const stores = await prisma.store.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
    where: { id: { in: storeIds }, deletedAt: null },
  });
  return {
    permissions: [...new Set(memberships.flatMap((m) => [...m.permissions]))],
    role: memberships[0]?.sellerRole,
    stores,
  };
}

export async function getSellerDashboard(actor: ActorContext) {
  const { storeIds } = await requireSellerWorkspace(actor);
  const { end, start } = dushanbeDayRange();
  const activeStatuses = [
    OrderStatus.AWAITING_SELLER_CONFIRMATION,
    OrderStatus.CONFIRMED,
    OrderStatus.PREPARING,
    OrderStatus.READY_FOR_PICKUP,
  ];
  const [
    ordersToday,
    counts,
    totals,
    activeProducts,
    lowStockProducts,
    recent,
  ] = await Promise.all([
    prisma.order.count({
      where: { createdAt: { gte: start, lt: end }, storeId: { in: storeIds } },
    }),
    prisma.order.groupBy({
      _count: true,
      by: ["status"],
      where: { status: { in: activeStatuses }, storeId: { in: storeIds } },
    }),
    prisma.order.aggregate({
      _avg: { grandTotal: true },
      _sum: { grandTotal: true },
      where: {
        createdAt: { gte: start, lt: end },
        status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] },
        storeId: { in: storeIds },
      },
    }),
    prisma.product.count({
      where: {
        deletedAt: null,
        status: ProductStatus.ACTIVE,
        storeId: { in: storeIds },
      },
    }),
    prisma.product.count({
      where: {
        deletedAt: null,
        status: { not: ProductStatus.ARCHIVED },
        stockQuantity: { lte: 5 },
        storeId: { in: storeIds },
      },
    }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        grandTotal: true,
        orderNumber: true,
        status: true,
        store: { select: { name: true } },
      },
      take: 8,
      where: { storeId: { in: storeIds } },
    }),
  ]);
  const count = (status: OrderStatus) =>
    counts.find((entry) => entry.status === status)?._count ?? 0;
  return {
    activeProducts,
    averageOrderValue: totals._avg.grandTotal
      ? money(totals._avg.grandTotal)
      : "0.00",
    awaitingConfirmation: count(OrderStatus.AWAITING_SELLER_CONFIRMATION),
    lowStockProducts,
    ordersToday,
    preparing: count(OrderStatus.PREPARING),
    readyForPickup: count(OrderStatus.READY_FOR_PICKUP),
    recentOrders: recent.map((order) => ({
      ...order,
      createdAt: order.createdAt.toISOString(),
      grandTotal: money(order.grandTotal),
    })),
    revenueToday: totals._sum.grandTotal
      ? money(totals._sum.grandTotal)
      : "0.00",
  };
}

export async function listSellerOrders(
  actor: ActorContext,
  filter: SellerOrderFilter,
) {
  const { storeIds } = await requireSellerWorkspace(actor);
  const where: Prisma.OrderWhereInput = {
    storeId: { in: storeIds },
    ...(filter.status === "ALL" ? {} : { status: filter.status }),
  };
  const [items, total] = await Promise.all([
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        _count: { select: { items: true } },
        createdAt: true,
        currencyCode: true,
        grandTotal: true,
        orderNumber: true,
        requestedDeliveryDate: true,
        requestedDeliveryWindowEnd: true,
        requestedDeliveryWindowStart: true,
        status: true,
        store: { select: { name: true } },
      },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      where,
    }),
    prisma.order.count({ where }),
  ]);
  return {
    items: items.map(({ _count, ...order }) => ({
      ...order,
      createdAt: order.createdAt.toISOString(),
      grandTotal: money(order.grandTotal),
      itemCount: _count.items,
      requestedDeliveryDate: order.requestedDeliveryDate
        .toISOString()
        .slice(0, 10),
      requestedDeliveryWindowEnd: order.requestedDeliveryWindowEnd
        .toISOString()
        .slice(11, 16),
      requestedDeliveryWindowStart: order.requestedDeliveryWindowStart
        .toISOString()
        .slice(11, 16),
    })),
    page: filter.page,
    pageSize: filter.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / filter.pageSize)),
  };
}

export async function getSellerOrder(actor: ActorContext, orderNumber: string) {
  const target = await prisma.order.findUnique({
    select: { id: true, storeId: true },
    where: { orderNumber },
  });
  if (!target)
    throw new MarketplaceError("ORDER_NOT_FOUND", "Заказ не найден", 404);
  await assertSellerStoreAccess(actor, target.storeId);
  const order = await prisma.order.findUniqueOrThrow({
    include: {
      deliveryAddress: true,
      items: { orderBy: { createdAt: "asc" } },
      returnDispositions: { orderBy: { createdAt: "asc" } },
      statusHistory: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      store: { select: { id: true, name: true, phoneE164: true } },
    },
    where: { id: target.id },
  });
  const { buyerName, buyerPhoneE164, ...fulfillmentOrder } = order;
  void buyerName;
  void buyerPhoneE164;
  return {
    ...fulfillmentOrder,
    createdAt: order.createdAt.toISOString(),
    deliveryFee: money(order.deliveryFee),
    discountTotal: money(order.discountTotal),
    grandTotal: money(order.grandTotal),
    items: order.items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      lineTotal: money(item.lineTotal),
      unitPrice: money(item.unitPrice),
    })),
    itemsSubtotal: money(order.itemsSubtotal),
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

export async function sellerTransitionOrder(
  actor: ActorContext,
  orderNumber: string,
  input: {
    expectedVersion?: number | undefined;
    newStatus: OrderStatus;
    note?: string | undefined;
    reason?: string | undefined;
    requestId?: string | undefined;
  },
) {
  const order = await prisma.order.findUnique({
    select: { id: true, storeId: true },
    where: { orderNumber },
  });
  if (!order)
    throw new MarketplaceError("ORDER_NOT_FOUND", "Заказ не найден", 404);
  await assertSellerStoreAccess(
    actor,
    order.storeId,
    SellerPermission.ManageOrders,
  );
  const sellerTargets = new Set<OrderStatus>([
    OrderStatus.CONFIRMED,
    OrderStatus.CANCELLED,
    OrderStatus.PREPARING,
    OrderStatus.READY_FOR_PICKUP,
  ]);
  if (!sellerTargets.has(input.newStatus)) {
    throw new MarketplaceError(
      "INVALID_ORDER_TRANSITION",
      "Продавец не может установить этот статус",
      409,
    );
  }
  if (input.newStatus === OrderStatus.CANCELLED && !input.reason) {
    throw new MarketplaceError(
      "VALIDATION_ERROR",
      "Укажите причину отклонения",
      400,
    );
  }
  return transitionOrder(actor, {
    cancellationReasonCode: input.reason,
    expectedVersion: input.expectedVersion,
    newStatus: input.newStatus,
    note: input.note,
    orderId: order.id,
    requestId: input.requestId,
  });
}

export async function listSellerProducts(
  actor: ActorContext,
  filter: SellerProductFilter,
) {
  const { storeIds } = await requireSellerWorkspace(actor);
  if (filter.storeId) await assertSellerStoreAccess(actor, filter.storeId);
  const scopedStoreIds = filter.storeId ? [filter.storeId] : storeIds;
  const where: Prisma.ProductWhereInput = {
    storeId: { in: scopedStoreIds },
  };
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        category: { select: { name: true } },
        currencyCode: true,
        deletedAt: true,
        id: true,
        images: {
          orderBy: { sortOrder: "asc" },
          select: { altText: true, objectKey: true },
          take: 1,
        },
        name: true,
        price: true,
        reservedQuantity: true,
        revisions: {
          orderBy: { submittedAt: "desc" },
          select: { rejectionReason: true, status: true },
          take: 1,
        },
        status: true,
        stockQuantity: true,
        store: { select: { id: true, name: true } },
        version: true,
      },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      where,
    }),
    prisma.product.count({ where }),
  ]);
  return {
    items: items.map((item) => ({
      ...item,
      availableQuantity: item.stockQuantity - item.reservedQuantity,
      price: money(item.price),
    })),
    page: filter.page,
    pageSize: filter.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / filter.pageSize)),
  };
}

export async function getSellerProduct(actor: ActorContext, productId: string) {
  const product = await prisma.product.findUnique({
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      revisions: {
        orderBy: { submittedAt: "desc" },
        take: 1,
      },
      variants: { orderBy: { sortOrder: "asc" } },
    },
    where: { id: productId },
  });
  if (!product)
    throw new MarketplaceError("PRODUCT_UNAVAILABLE", "Товар не найден", 404);
  await assertSellerStoreAccess(actor, product.storeId);
  return {
    ...product,
    compareAtPrice: product.compareAtPrice
      ? money(product.compareAtPrice)
      : null,
    price: money(product.price),
    latestRevision: product.revisions[0]
      ? {
          categoryId: product.revisions[0].categoryId,
          compareAtPrice: product.revisions[0].compareAtPrice
            ? money(product.revisions[0].compareAtPrice)
            : null,
          description: product.revisions[0].description,
          id: product.revisions[0].id,
          images: product.revisions[0].images,
          name: product.revisions[0].name,
          price: money(product.revisions[0].price),
          rejectionReason: product.revisions[0].rejectionReason,
          slug: product.revisions[0].slug,
          status: product.revisions[0].status,
          variants: product.revisions[0].variants,
        }
      : null,
    variants: product.variants.map((variant) => ({
      ...variant,
      absolutePrice: variant.absolutePrice
        ? money(variant.absolutePrice)
        : null,
      priceDelta: money(variant.priceDelta),
    })),
  };
}

export async function createSellerProduct(
  actor: ActorContext,
  input: SellerProductInput,
  requestId?: string,
) {
  validateImageMetadata(input.images);
  return prisma.$transaction(async (tx) => {
    await assertSellerStoreAccess(
      actor,
      input.storeId,
      SellerPermission.ManageProducts,
      tx,
    );
    const category = await tx.category.findFirst({
      select: { id: true },
      where: { id: input.categoryId, isActive: true, deletedAt: null },
    });
    if (!category)
      throw new MarketplaceError(
        "VALIDATION_ERROR",
        "Категория недоступна",
        400,
      );
    const duplicate = await tx.product.count({ where: { slug: input.slug } });
    if (duplicate)
      throw new MarketplaceError(
        "PRODUCT_SLUG_CONFLICT",
        "Такой slug уже используется",
        409,
      );
    const product = await tx.product.create({
      data: {
        categoryId: input.categoryId,
        compareAtPrice: input.compareAtPrice ?? null,
        currencyCode: "TJS",
        description: input.description,
        images: {
          create: input.images.map((image) => ({
            altText: image.altText,
            isPrimary: image.isPrimary,
            objectKey: image.objectKey,
            sortOrder: image.sortOrder,
          })),
        },
        name: input.name,
        preparationTimeMinutes: input.preparationTimeMinutes,
        price: input.price,
        slug: input.slug,
        status: input.status,
        stockQuantity: input.stockQuantity,
        storeId: input.storeId,
        variants: {
          create: input.variants.map((variant) => ({
            absolutePrice: variant.absolutePrice ?? null,
            isActive: variant.isActive,
            name: variant.name,
            priceDelta: variant.priceDelta,
            sku: variant.sku ?? null,
            sortOrder: variant.sortOrder,
            stockQuantity: variant.stockQuantity,
          })),
        },
      },
    });
    await audit(tx, actor, {
      action: "product.created",
      after: {
        name: product.name,
        status: product.status,
        stockQuantity: product.stockQuantity,
      },
      requestId,
      subjectId: product.id,
      subjectType: "Product",
    });
    return product;
  });
}

export async function updateSellerProduct(
  actor: ActorContext,
  productId: string,
  input: SellerProductInput,
  requestId?: string,
) {
  validateImageMetadata(input.images);
  return prisma.$transaction(async (tx) => {
    const current = await tx.product.findUnique({
      include: {
        images: { orderBy: { sortOrder: "asc" } },
        variants: { orderBy: { sortOrder: "asc" } },
      },
      where: { id: productId },
    });
    if (!current)
      throw new MarketplaceError("PRODUCT_UNAVAILABLE", "Товар не найден", 404);
    await assertSellerStoreAccess(
      actor,
      current.storeId,
      SellerPermission.ManageProducts,
      tx,
    );
    await assertSellerStoreAccess(
      actor,
      input.storeId,
      SellerPermission.ManageProducts,
      tx,
    );
    if (input.stockQuantity < current.reservedQuantity) {
      throw new MarketplaceError(
        "INSUFFICIENT_STOCK",
        "Остаток не может быть ниже резерва",
        409,
      );
    }
    for (const variant of input.variants) {
      const existing = variant.id
        ? current.variants.find(({ id }) => id === variant.id)
        : undefined;
      if (variant.id && !existing)
        throw new AuthorizationError(
          "FORBIDDEN",
          "Вариант не принадлежит товару",
        );
      if (existing && variant.stockQuantity < existing.reservedQuantity) {
        throw new MarketplaceError(
          "INSUFFICIENT_STOCK",
          `Остаток варианта «${existing.name}» ниже резерва`,
          409,
        );
      }
    }
    const expectedVersion = input.version ?? current.version;

    if (
      current.status === ProductStatus.ACTIVE ||
      current.status === ProductStatus.HIDDEN
    ) {
      if (input.storeId !== current.storeId) {
        throw new MarketplaceError(
          "PRODUCT_MODERATION_CONFLICT",
          "Опубликованный товар нельзя переносить между магазинами",
          409,
        );
      }
      const sensitive = sensitiveProductSnapshot(input);
      const hasSensitiveChanges =
        JSON.stringify(sensitive) !==
        JSON.stringify(currentSensitiveSnapshot(current));
      const updated = await tx.product.updateMany({
        data: {
          preparationTimeMinutes: input.preparationTimeMinutes,
          stockQuantity: input.stockQuantity,
          version: { increment: 1 },
        },
        where: { id: productId, version: expectedVersion },
      });
      if (updated.count !== 1)
        throw new MarketplaceError(
          "VERSION_CONFLICT",
          "Товар уже изменён",
          409,
        );

      for (const variant of input.variants) {
        if (!variant.id) continue;
        await tx.productVariant.update({
          data: {
            isActive: variant.isActive,
            stockQuantity: variant.stockQuantity,
            version: { increment: 1 },
          },
          where: { id: variant.id },
        });
      }

      let revisionId: string | null = null;
      if (hasSensitiveChanges) {
        await tx.productRevision.updateMany({
          data: { status: ProductRevisionStatus.SUPERSEDED },
          where: {
            productId,
            status: {
              in: [
                ProductRevisionStatus.DRAFT,
                ProductRevisionStatus.PENDING_REVIEW,
                ProductRevisionStatus.REJECTED,
              ],
            },
          },
        });
        const revision = await tx.productRevision.create({
          data: {
            categoryId: input.categoryId,
            compareAtPrice: input.compareAtPrice ?? null,
            description: input.description,
            images: input.images as unknown as Prisma.InputJsonValue,
            name: input.name,
            price: input.price,
            productId,
            slug: input.slug,
            status: revisionStatus(input.status),
            submittedByUserId: actor.userId,
            variants: input.variants as unknown as Prisma.InputJsonValue,
          },
        });
        revisionId = revision.id;
      }
      await audit(tx, actor, {
        action: hasSensitiveChanges
          ? "product.revision_submitted"
          : "product.operational_updated",
        after: {
          liveStatus: current.status,
          revisionId,
          revisionStatus: hasSensitiveChanges ? input.status : null,
          stockQuantity: input.stockQuantity,
        },
        before: {
          liveStatus: current.status,
          stockQuantity: current.stockQuantity,
        },
        requestId,
        subjectId: productId,
        subjectType: "Product",
      });
      return tx.product.findUniqueOrThrow({ where: { id: productId } });
    }

    const updated = await tx.product.updateMany({
      data: {
        categoryId: input.categoryId,
        compareAtPrice: input.compareAtPrice ?? null,
        description: input.description,
        name: input.name,
        preparationTimeMinutes: input.preparationTimeMinutes,
        price: input.price,
        slug: input.slug,
        status: input.status,
        moderatedAt: null,
        moderatedByUserId: null,
        moderationNote: null,
        stockQuantity: input.stockQuantity,
        storeId: input.storeId,
        version: { increment: 1 },
      },
      where: { id: productId, version: expectedVersion },
    });
    if (updated.count !== 1)
      throw new MarketplaceError("VERSION_CONFLICT", "Товар уже изменён", 409);
    await tx.productImage.deleteMany({ where: { productId } });
    if (input.images.length) {
      await tx.productImage.createMany({
        data: input.images.map((image) => ({
          altText: image.altText,
          isPrimary: image.isPrimary,
          objectKey: image.objectKey,
          productId,
          sortOrder: image.sortOrder,
        })),
      });
    }
    const submittedIds = input.variants.flatMap((variant) => variant.id ?? []);
    const omitted = current.variants.filter(
      ({ id }) => !submittedIds.includes(id),
    );
    if (omitted.some(({ reservedQuantity }) => reservedQuantity > 0)) {
      throw new MarketplaceError(
        "INSUFFICIENT_STOCK",
        "Нельзя удалить зарезервированный вариант",
        409,
      );
    }
    await tx.productVariant.updateMany({
      data: { deletedAt: new Date(), isActive: false },
      where: { id: { in: omitted.map(({ id }) => id) } },
    });
    for (const { id, ...variant } of input.variants) {
      if (id) {
        await tx.productVariant.update({
          data: {
            ...variant,
            absolutePrice: variant.absolutePrice ?? null,
            deletedAt: null,
            sku: variant.sku ?? null,
            version: { increment: 1 },
          },
          where: { id },
        });
      } else {
        await tx.productVariant.create({
          data: {
            ...variant,
            absolutePrice: variant.absolutePrice ?? null,
            productId,
            sku: variant.sku ?? null,
          },
        });
      }
    }
    await audit(tx, actor, {
      action: "product.updated",
      after: {
        name: input.name,
        status: input.status,
        stockQuantity: input.stockQuantity,
      },
      before: {
        name: current.name,
        status: current.status,
        stockQuantity: current.stockQuantity,
      },
      requestId,
      subjectId: productId,
      subjectType: "Product",
    });
    return tx.product.findUniqueOrThrow({ where: { id: productId } });
  });
}

export async function archiveSellerProduct(
  actor: ActorContext,
  productId: string,
  requestId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product)
      throw new MarketplaceError("PRODUCT_UNAVAILABLE", "Товар не найден", 404);
    await assertSellerStoreAccess(
      actor,
      product.storeId,
      SellerPermission.ManageProducts,
      tx,
    );
    const archived = await tx.product.update({
      data: {
        deletedAt: new Date(),
        status: ProductStatus.ARCHIVED,
        version: { increment: 1 },
      },
      where: { id: product.id },
    });
    await audit(tx, actor, {
      action: "product.archived",
      before: { status: product.status },
      after: { status: archived.status },
      requestId,
      subjectId: product.id,
      subjectType: "Product",
    });
    return archived;
  });
}

export async function getSellerStore(actor: ActorContext, storeId?: string) {
  const { storeIds } = await requireSellerWorkspace(actor);
  const selectedId = storeId ?? storeIds[0];
  if (!selectedId)
    throw new AuthorizationError("FORBIDDEN", "Нет доступного магазина");
  await assertSellerStoreAccess(actor, selectedId);
  const store = await prisma.store.findUniqueOrThrow({
    include: { address: true, openingHours: { orderBy: { dayOfWeek: "asc" } } },
    where: { id: selectedId },
  });
  return {
    ...store,
    defaultCommissionRate: undefined,
    deliveryFeeAmount: money(store.deliveryFeeAmount),
    minimumOrderAmount: money(store.minimumOrderAmount),
    ratingAverage: store.ratingAverage.toFixed(2),
  };
}

export async function updateSellerStore(
  actor: ActorContext,
  storeId: string,
  input: SellerStoreUpdate,
  requestId?: string,
) {
  return prisma.$transaction(async (tx) => {
    await assertSellerStoreAccess(
      actor,
      storeId,
      SellerPermission.ManageStore,
      tx,
    );
    const current = await tx.store.findUniqueOrThrow({
      where: { id: storeId },
    });
    const store = await tx.store.update({
      data: {
        defaultPreparationMinutes: input.defaultPreparationMinutes,
        deliveryFeeAmount: input.deliveryFeeAmount,
        description: input.description,
        isOpen: input.isOpen,
        isTemporarilyPaused: input.isTemporarilyPaused,
        minimumOrderAmount: input.minimumOrderAmount,
        name: input.name,
        pauseReason: input.isTemporarilyPaused ? input.pauseReason : null,
        phoneE164: input.phoneE164,
      },
      where: { id: storeId },
    });
    for (const hour of input.openingHours) {
      await tx.storeOpeningHour.upsert({
        create: { ...hour, storeId },
        update: hour,
        where: { storeId_dayOfWeek: { dayOfWeek: hour.dayOfWeek, storeId } },
      });
    }
    await audit(tx, actor, {
      action: "store.updated",
      after: {
        isOpen: store.isOpen,
        isTemporarilyPaused: store.isTemporarilyPaused,
        name: store.name,
      },
      before: {
        isOpen: current.isOpen,
        isTemporarilyPaused: current.isTemporarilyPaused,
        name: current.name,
      },
      requestId,
      subjectId: storeId,
      subjectType: "Store",
    });
    return store;
  });
}

export async function listSellerProductCategories(actor: ActorContext) {
  await requireSellerWorkspace(actor);
  return prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
    where: { deletedAt: null, isActive: true },
  });
}
