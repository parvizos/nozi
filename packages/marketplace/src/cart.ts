import { assertRole, type ActorContext } from "@nozi/auth";
import {
  CartStatus,
  Prisma,
  ProductStatus,
  SellerStatus,
  StoreStatus,
  UserRoleCode,
  prisma,
} from "@nozi/database";

import {
  addCartItemSchema,
  updateCartItemSchema,
  type AddCartItemInput,
  type UpdateCartItemInput,
} from "./cart-contracts";
import { MarketplaceError } from "./errors";

type DbClient = Prisma.TransactionClient | typeof prisma;

const cartInclude = {
  items: {
    include: {
      product: {
        include: {
          images: {
            orderBy: [
              { isPrimary: "desc" as const },
              { sortOrder: "asc" as const },
            ],
            take: 1,
            where: { deletedAt: null },
          },
        },
      },
      variant: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
  store: true,
} satisfies Prisma.CartInclude;

type CartRecord = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

export type CartView = {
  count: number;
  currencyCode: string;
  deliveryFee: string;
  id: string;
  items: Array<{
    available: boolean;
    id: string;
    image: { alt: string; src: string } | null;
    lineTotal: string;
    productId: string;
    productName: string;
    productSlug: string;
    productVariantId: string | null;
    quantity: number;
    unitPrice: string;
    variantName: string | null;
  }>;
  minimumOrderAmount: string;
  store: { id: string; name: string; slug: string };
  subtotal: string;
  totalPreview: string;
};

function assertCustomer(actor: ActorContext): void {
  assertRole(actor, [UserRoleCode.CUSTOMER]);
}

export function calculateUnitPrice(
  productPrice: Prisma.Decimal,
  variant: {
    absolutePrice: Prisma.Decimal | null;
    priceDelta: Prisma.Decimal;
  } | null,
): Prisma.Decimal {
  if (!variant) return productPrice;
  return variant.absolutePrice ?? productPrice.add(variant.priceDelta);
}

function availableQuantity(input: {
  reservedQuantity: number;
  stockQuantity: number;
  trackInventory?: boolean;
}): number {
  return input.trackInventory === false
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, input.stockQuantity - input.reservedQuantity);
}

function currentItemPrice(item: CartRecord["items"][number]): Prisma.Decimal {
  return calculateUnitPrice(item.product.price, item.variant);
}

function serializeCart(cart: CartRecord): CartView {
  let subtotal = new Prisma.Decimal(0);
  const items = cart.items.map((item) => {
    const unitPrice = currentItemPrice(item);
    const lineTotal = unitPrice.mul(item.quantity);
    subtotal = subtotal.add(lineTotal);
    const productAvailable = availableQuantity(item.product);
    const variantAvailable = item.variant
      ? availableQuantity(item.variant)
      : Number.MAX_SAFE_INTEGER;
    const image = item.product.images[0];

    return {
      available:
        item.product.status === ProductStatus.ACTIVE &&
        productAvailable >= item.quantity &&
        variantAvailable >= item.quantity &&
        (!item.productVariantId || Boolean(item.variant?.isActive)),
      id: item.id,
      image: image ? { alt: image.altText, src: image.objectKey } : null,
      lineTotal: lineTotal.toFixed(2),
      productId: item.productId,
      productName: item.product.name,
      productSlug: item.product.slug,
      productVariantId: item.productVariantId,
      quantity: item.quantity,
      unitPrice: unitPrice.toFixed(2),
      variantName: item.variant?.name ?? null,
    };
  });
  const deliveryFee = cart.store.deliveryFeeAmount;

  return {
    count: cart.items.reduce((sum, item) => sum + item.quantity, 0),
    currencyCode: cart.currencyCode,
    deliveryFee: deliveryFee.toFixed(2),
    id: cart.id,
    items,
    minimumOrderAmount: cart.store.minimumOrderAmount.toFixed(2),
    store: { id: cart.store.id, name: cart.store.name, slug: cart.store.slug },
    subtotal: subtotal.toFixed(2),
    totalPreview: subtotal.add(deliveryFee).toFixed(2),
  };
}

async function findActiveCart(db: DbClient, customerUserId: string) {
  return db.cart.findFirst({
    include: cartInclude,
    where: { customerUserId, status: CartStatus.ACTIVE },
  });
}

async function loadSellableProduct(
  db: DbClient,
  productId: string,
  productVariantId: string | null | undefined,
) {
  const product = await db.product.findFirst({
    include: {
      store: { include: { seller: true } },
      variants: { where: { deletedAt: null, isActive: true } },
    },
    where: { deletedAt: null, id: productId, status: ProductStatus.ACTIVE },
  });
  if (!product) {
    throw new MarketplaceError(
      "PRODUCT_UNAVAILABLE",
      "Этот товар больше недоступен",
      422,
    );
  }
  if (
    product.store.deletedAt ||
    !product.store.isActive ||
    product.store.status !== StoreStatus.ACTIVE ||
    product.store.isTemporarilyPaused ||
    product.store.seller.deletedAt ||
    product.store.seller.status !== SellerStatus.APPROVED
  ) {
    throw new MarketplaceError(
      "STORE_UNAVAILABLE",
      "Магазин временно не принимает заказы",
      422,
    );
  }

  const variant = productVariantId
    ? product.variants.find(({ id }) => id === productVariantId)
    : null;
  if (product.variants.length > 0 && !productVariantId) {
    throw new MarketplaceError(
      "VARIANT_REQUIRED",
      "Выберите вариант товара",
      422,
    );
  }
  if (productVariantId && !variant) {
    throw new MarketplaceError(
      "VARIANT_UNAVAILABLE",
      "Выбранный вариант недоступен",
      422,
    );
  }
  return { product, variant };
}

function assertStock(
  product: {
    reservedQuantity: number;
    stockQuantity: number;
    trackInventory: boolean;
  },
  variant: { reservedQuantity: number; stockQuantity: number } | null,
  quantity: number,
): void {
  const available = Math.min(
    availableQuantity(product),
    variant ? availableQuantity(variant) : Number.MAX_SAFE_INTEGER,
  );
  if (quantity > available) {
    throw new MarketplaceError(
      "INSUFFICIENT_STOCK",
      "Недостаточно товара в наличии",
      409,
      { availableQuantity: String(available) },
    );
  }
}

export async function getCart(actor: ActorContext): Promise<CartView | null> {
  assertCustomer(actor);
  const cart = await findActiveCart(prisma, actor.userId);
  return cart ? serializeCart(cart) : null;
}

export async function getCartCount(actor: ActorContext): Promise<number> {
  assertCustomer(actor);
  const result = await prisma.cartItem.aggregate({
    _sum: { quantity: true },
    where: {
      cart: { customerUserId: actor.userId, status: CartStatus.ACTIVE },
    },
  });
  return result._sum.quantity ?? 0;
}

export async function getCheckoutCustomerProfile(actor: ActorContext) {
  assertCustomer(actor);
  return prisma.user.findUniqueOrThrow({
    select: { name: true, phoneNumber: true },
    where: { id: actor.userId },
  });
}

export async function addCartItem(
  actor: ActorContext,
  rawInput: AddCartItemInput,
): Promise<CartView> {
  assertCustomer(actor);
  const input = addCartItemSchema.parse(rawInput);

  return prisma.$transaction(
    async (tx) => {
      const { product, variant } = await loadSellableProduct(
        tx,
        input.productId,
        input.productVariantId,
      );
      let cart = await tx.cart.findFirst({
        where: { customerUserId: actor.userId, status: CartStatus.ACTIVE },
      });
      if (cart && cart.storeId !== product.storeId) {
        throw new MarketplaceError(
          "CART_STORE_CONFLICT",
          "В корзине уже есть товары другого магазина",
          409,
          { currentStoreId: cart.storeId, requestedStoreId: product.storeId },
        );
      }
      cart ??= await tx.cart.create({
        data: {
          currencyCode: product.currencyCode,
          customerUserId: actor.userId,
          storeId: product.storeId,
        },
      });

      const existing = await tx.cartItem.findFirst({
        where: {
          cartId: cart.id,
          productId: product.id,
          productVariantId: variant?.id ?? null,
        },
      });
      const quantity = (existing?.quantity ?? 0) + input.quantity;
      assertStock(product, variant ?? null, quantity);
      const unitPrice = calculateUnitPrice(product.price, variant ?? null);

      if (existing) {
        await tx.cartItem.update({
          data: { quantity, unitPriceSnapshot: unitPrice },
          where: { id: existing.id },
        });
      } else {
        await tx.cartItem.create({
          data: {
            cartId: cart.id,
            currencyCode: product.currencyCode,
            productId: product.id,
            productVariantId: variant?.id ?? null,
            quantity,
            unitPriceSnapshot: unitPrice,
          },
        });
      }
      await tx.cart.update({
        data: { version: { increment: 1 } },
        where: { id: cart.id },
      });
      const updated = await findActiveCart(tx, actor.userId);
      if (!updated) throw new Error("Cart disappeared during update");
      return serializeCart(updated);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updateCartItem(
  actor: ActorContext,
  itemId: string,
  rawInput: UpdateCartItemInput,
): Promise<CartView> {
  assertCustomer(actor);
  const input = updateCartItemSchema.parse(rawInput);

  return prisma.$transaction(
    async (tx) => {
      const item = await tx.cartItem.findFirst({
        include: { cart: true },
        where: {
          cart: { customerUserId: actor.userId, status: CartStatus.ACTIVE },
          id: itemId,
        },
      });
      if (!item) {
        throw new MarketplaceError(
          "CART_ITEM_NOT_FOUND",
          "Позиция корзины не найдена",
          404,
        );
      }
      const { product, variant } = await loadSellableProduct(
        tx,
        item.productId,
        item.productVariantId,
      );
      assertStock(product, variant ?? null, input.quantity);
      await tx.cartItem.update({
        data: {
          quantity: input.quantity,
          unitPriceSnapshot: calculateUnitPrice(product.price, variant ?? null),
        },
        where: { id: item.id },
      });
      await tx.cart.update({
        data: { version: { increment: 1 } },
        where: { id: item.cartId },
      });
      const updated = await findActiveCart(tx, actor.userId);
      if (!updated) throw new Error("Cart disappeared during update");
      return serializeCart(updated);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function removeCartItem(
  actor: ActorContext,
  itemId: string,
): Promise<CartView | null> {
  assertCustomer(actor);
  return prisma.$transaction(async (tx) => {
    const result = await tx.cartItem.deleteMany({
      where: {
        cart: { customerUserId: actor.userId, status: CartStatus.ACTIVE },
        id: itemId,
      },
    });
    if (result.count === 0) {
      throw new MarketplaceError(
        "CART_ITEM_NOT_FOUND",
        "Позиция корзины не найдена",
        404,
      );
    }
    const cart = await tx.cart.findFirst({
      where: { customerUserId: actor.userId, status: CartStatus.ACTIVE },
    });
    if (cart) {
      await tx.cart.update({
        data: { version: { increment: 1 } },
        where: { id: cart.id },
      });
    }
    const updated = await findActiveCart(tx, actor.userId);
    return updated ? serializeCart(updated) : null;
  });
}

export async function clearCart(actor: ActorContext): Promise<void> {
  assertCustomer(actor);
  await prisma.cart.updateMany({
    data: { status: CartStatus.ABANDONED, version: { increment: 1 } },
    where: { customerUserId: actor.userId, status: CartStatus.ACTIVE },
  });
}
