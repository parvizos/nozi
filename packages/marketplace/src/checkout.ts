import { createHash, randomBytes } from "node:crypto";

import { assertRole, type ActorContext } from "@nozi/auth";
import {
  CartStatus,
  InventoryReservationStatus,
  OrderActorType,
  OrderStatus,
  OrderStatusSource,
  PaymentMethod,
  Prisma,
  ProductStatus,
  SellerStatus,
  StoreStatus,
  UserRoleCode,
  prisma,
} from "@nozi/database";

import {
  checkoutSchema,
  idempotencyKeySchema,
  type CheckoutInput,
} from "./checkout-contracts";
import { calculateUnitPrice } from "./cart";
import { MarketplaceError } from "./errors";
import {
  systemTransitionPrincipal,
  transitionOrderInTransaction,
} from "./order-state-machine";
import { getPaymentProvider } from "./payments";
import { consumeCheckoutRateLimit } from "./rate-limit";

const IDEMPOTENCY_SCOPE = "customer.checkout";
const ORDER_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export type PlaceOrderOptions = {
  idempotencyKey: string;
  requestId: string;
};

export type PlaceOrderResult = {
  created: boolean;
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
};

function orderNumber(now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const bytes = randomBytes(8);
  let suffix = "";
  for (const byte of bytes)
    suffix += ORDER_ALPHABET[byte % ORDER_ALPHABET.length];
  return `NZ-${date}-${suffix}`;
}

function checkoutHash(input: CheckoutInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function localToday(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date());
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

function dateValue(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function timeValue(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

async function existingIdempotentOrder(
  actorUserId: string,
  key: string,
  requestHash: string,
): Promise<PlaceOrderResult | null> {
  const record = await prisma.idempotencyKey.findUnique({
    where: {
      scope_actorUserId_key: { actorUserId, key, scope: IDEMPOTENCY_SCOPE },
    },
  });
  if (!record) return null;
  if (record.requestHash !== requestHash) {
    throw new MarketplaceError(
      "IDEMPOTENCY_CONFLICT",
      "Этот Idempotency-Key уже использован с другими данными",
      409,
    );
  }
  if (!record.resourceId) {
    throw new MarketplaceError(
      "IDEMPOTENCY_CONFLICT",
      "Оформление с этим ключом ещё обрабатывается",
      409,
    );
  }
  const order = await prisma.order.findFirst({
    select: { id: true, orderNumber: true, status: true },
    where: { customerUserId: actorUserId, id: record.resourceId },
  });
  if (!order) throw new Error("Idempotency record references a missing order");
  return {
    created: false,
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
  };
}

export async function placeOrder(
  actor: ActorContext,
  rawInput: CheckoutInput,
  rawOptions: PlaceOrderOptions,
): Promise<PlaceOrderResult> {
  assertRole(actor, [UserRoleCode.CUSTOMER]);
  const input = checkoutSchema.parse(rawInput);
  const idempotencyKey = idempotencyKeySchema.parse(rawOptions.idempotencyKey);
  const requestHash = checkoutHash(input);
  const existing = await existingIdempotentOrder(
    actor.userId,
    idempotencyKey,
    requestHash,
  );
  if (existing) return existing;
  await consumeCheckoutRateLimit(actor.userId);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const duplicate = await tx.idempotencyKey.findUnique({
            where: {
              scope_actorUserId_key: {
                actorUserId: actor.userId,
                key: idempotencyKey,
                scope: IDEMPOTENCY_SCOPE,
              },
            },
          });
          if (duplicate) {
            if (
              duplicate.requestHash !== requestHash ||
              !duplicate.resourceId
            ) {
              throw new MarketplaceError(
                "IDEMPOTENCY_CONFLICT",
                "Idempotency-Key уже используется",
                409,
              );
            }
            const order = await tx.order.findUniqueOrThrow({
              select: { id: true, orderNumber: true, status: true },
              where: { id: duplicate.resourceId },
            });
            return {
              created: false,
              orderId: order.id,
              orderNumber: order.orderNumber,
              status: order.status,
            };
          }
          await tx.idempotencyKey.create({
            data: {
              actorUserId: actor.userId,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              key: idempotencyKey,
              requestHash,
              scope: IDEMPOTENCY_SCOPE,
            },
          });

          const cart = await tx.cart.findFirst({
            include: {
              items: {
                include: {
                  product: {
                    include: {
                      images: {
                        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
                        take: 1,
                        where: { deletedAt: null },
                      },
                    },
                  },
                  variant: true,
                },
                orderBy: { createdAt: "asc" },
              },
              store: {
                include: {
                  city: { include: { country: true } },
                  seller: true,
                },
              },
            },
            where: { customerUserId: actor.userId, status: CartStatus.ACTIVE },
          });
          if (!cart || cart.items.length === 0) {
            throw new MarketplaceError("CART_EMPTY", "Корзина пуста", 422);
          }
          if (
            cart.store.deletedAt ||
            !cart.store.isActive ||
            !cart.store.deliveryEnabled ||
            cart.store.isTemporarilyPaused ||
            cart.store.status !== StoreStatus.ACTIVE ||
            cart.store.seller.deletedAt ||
            cart.store.seller.status !== SellerStatus.APPROVED
          ) {
            throw new MarketplaceError(
              "STORE_UNAVAILABLE",
              "Магазин временно не принимает заказы",
              422,
            );
          }
          if (input.deliveryDate < localToday(cart.store.city.timezone)) {
            throw new MarketplaceError(
              "VALIDATION_ERROR",
              "Дата доставки не может быть в прошлом",
              422,
            );
          }

          let itemsSubtotal = new Prisma.Decimal(0);
          const itemSnapshots: Array<{
            currencyCode: string;
            imageObjectKey: string | null;
            lineTotal: Prisma.Decimal;
            productId: string;
            productName: string;
            productVariantId: string | null;
            quantity: number;
            sku: string | null;
            unitPrice: Prisma.Decimal;
            variantName: string | null;
          }> = [];

          for (const item of cart.items) {
            const product = item.product;
            if (
              product.deletedAt ||
              product.status !== ProductStatus.ACTIVE ||
              product.storeId !== cart.storeId
            ) {
              throw new MarketplaceError(
                "PRODUCT_UNAVAILABLE",
                `${product.name} больше недоступен`,
                422,
              );
            }
            if (
              item.productVariantId &&
              (!item.variant ||
                !item.variant.isActive ||
                item.variant.deletedAt)
            ) {
              throw new MarketplaceError(
                "VARIANT_UNAVAILABLE",
                `Вариант товара ${product.name} больше недоступен`,
                422,
              );
            }
            if (product.currencyCode !== cart.currencyCode) {
              throw new Error("Cart contains multiple currencies");
            }
            if (product.trackInventory) {
              const productReserved = await tx.$executeRaw`
                UPDATE "products"
                SET "reserved_quantity" = "reserved_quantity" + ${item.quantity},
                    "version" = "version" + 1,
                    "updated_at" = NOW()
                WHERE "id" = ${product.id}::uuid
                  AND "stock_quantity" - "reserved_quantity" >= ${item.quantity}
              `;
              if (productReserved !== 1) {
                throw new MarketplaceError(
                  "INSUFFICIENT_STOCK",
                  `Недостаточно товара: ${product.name}`,
                  409,
                );
              }
              if (item.variant) {
                const variantReserved = await tx.$executeRaw`
                  UPDATE "product_variants"
                  SET "reserved_quantity" = "reserved_quantity" + ${item.quantity},
                      "version" = "version" + 1,
                      "updated_at" = NOW()
                  WHERE "id" = ${item.variant.id}::uuid
                    AND "is_active" = true
                    AND "deleted_at" IS NULL
                    AND "stock_quantity" - "reserved_quantity" >= ${item.quantity}
                `;
                if (variantReserved !== 1) {
                  throw new MarketplaceError(
                    "INSUFFICIENT_STOCK",
                    `Недостаточно выбранного варианта: ${product.name}`,
                    409,
                  );
                }
              }
            }
            const unitPrice = calculateUnitPrice(product.price, item.variant);
            const lineTotal = unitPrice.mul(item.quantity);
            itemsSubtotal = itemsSubtotal.add(lineTotal);
            itemSnapshots.push({
              currencyCode: product.currencyCode,
              imageObjectKey: product.images[0]?.objectKey ?? null,
              lineTotal,
              productId: product.id,
              productName: product.name,
              productVariantId: item.variant?.id ?? null,
              quantity: item.quantity,
              sku: item.variant?.sku ?? null,
              unitPrice,
              variantName: item.variant?.name ?? null,
            });
          }
          if (itemsSubtotal.lessThan(cart.store.minimumOrderAmount)) {
            throw new MarketplaceError(
              "VALIDATION_ERROR",
              `Минимальная сумма заказа ${cart.store.minimumOrderAmount.toFixed(2)} ${cart.currencyCode}`,
              422,
            );
          }

          const deliveryFee = cart.store.deliveryFeeAmount;
          const grandTotal = itemsSubtotal.add(deliveryFee);
          const paymentMethod = PaymentMethod[input.paymentMethod];
          const order = await tx.order.create({
            data: {
              anonymousDelivery: input.anonymousDelivery,
              buyerName: input.buyerName,
              buyerPhoneE164: input.buyerPhone,
              cityId: cart.store.cityId,
              currencyCode: cart.currencyCode,
              customerNote: input.customerNote ?? null,
              customerUserId: actor.userId,
              deliveryAddress: {
                create: {
                  apartment: input.apartment ?? null,
                  cityName: cart.store.city.name,
                  countryCode: cart.store.city.country.isoCode,
                  deliveryNote: input.deliveryNote ?? null,
                  entrance: input.entrance ?? null,
                  floor: input.floor ?? null,
                  line1: input.deliveryAddress,
                },
              },
              deliveryFee,
              deliveryTimezone: cart.store.city.timezone,
              giftMessage: input.giftMessage ?? null,
              grandTotal,
              items: { create: itemSnapshots },
              itemsSubtotal,
              orderNumber: orderNumber(),
              paymentMethod,
              placedAt: new Date(),
              recipientName: input.recipientName,
              recipientPhoneE164: input.recipientPhone,
              requestedDeliveryDate: dateValue(input.deliveryDate),
              requestedDeliveryWindowEnd: timeValue(input.deliveryWindowEnd),
              requestedDeliveryWindowStart: timeValue(
                input.deliveryWindowStart,
              ),
              status: OrderStatus.CREATED,
              statusHistory: {
                create: {
                  actorType: OrderActorType.CUSTOMER,
                  changedByUserId: actor.userId,
                  newStatus: OrderStatus.CREATED,
                  source: OrderStatusSource.API,
                },
              },
              storeId: cart.storeId,
            },
          });

          for (const item of itemSnapshots) {
            if (
              !cart.items.find(({ productId }) => productId === item.productId)
                ?.product.trackInventory
            )
              continue;
            await tx.inventoryReservation.create({
              data: {
                orderId: order.id,
                productId: item.productId,
                productVariantId: item.productVariantId,
                quantity: item.quantity,
                status: InventoryReservationStatus.ACTIVE,
              },
            });
          }

          const provider = getPaymentProvider(paymentMethod);
          const intent = await provider.createIntent({
            amount: grandTotal.toFixed(2),
            currencyCode: cart.currencyCode,
            idempotencyKey,
            orderId: order.id,
          });
          await tx.payment.create({
            data: {
              amount: grandTotal,
              authorizedAt: intent.authorizedAt,
              currencyCode: cart.currencyCode,
              idempotencyKey,
              method: paymentMethod,
              orderId: order.id,
              paidAt: intent.paidAt,
              provider: intent.provider,
              providerReference: intent.providerReference,
              status: intent.status,
            },
          });
          const commissionRate = cart.store.seller.defaultCommissionRate;
          await tx.commission.create({
            data: {
              basisAmount: itemsSubtotal,
              commissionAmount: itemsSubtotal
                .mul(commissionRate)
                .div(100)
                .toDecimalPlaces(2),
              currencyCode: cart.currencyCode,
              orderId: order.id,
              rate: commissionRate,
              sellerId: cart.store.sellerId,
            },
          });
          const transitioned = await transitionOrderInTransaction(
            tx,
            systemTransitionPrincipal,
            {
              expectedVersion: order.version,
              newStatus: OrderStatus.AWAITING_SELLER_CONFIRMATION,
              note: "Checkout completed",
              orderId: order.id,
              source: OrderStatusSource.SYSTEM,
            },
          );
          await tx.cart.update({
            data: { status: CartStatus.CONVERTED, version: { increment: 1 } },
            where: { id: cart.id },
          });
          await tx.idempotencyKey.update({
            data: {
              resourceId: order.id,
              resourceType: "order",
              responseStatus: 201,
            },
            where: {
              scope_actorUserId_key: {
                actorUserId: actor.userId,
                key: idempotencyKey,
                scope: IDEMPOTENCY_SCOPE,
              },
            },
          });
          await tx.auditLog.create({
            data: {
              action: "order.created",
              actorRole: UserRoleCode.CUSTOMER,
              actorUserId: actor.userId,
              afterRedacted: {
                currencyCode: cart.currencyCode,
                orderNumber: order.orderNumber,
                status: transitioned.status,
              },
              requestId: rawOptions.requestId,
              subjectId: order.id,
              subjectType: "order",
            },
          });
          return {
            created: true,
            orderId: order.id,
            orderNumber: order.orderNumber,
            status: transitioned.status,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 15_000,
        },
      );
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        const duplicate = await existingIdempotentOrder(
          actor.userId,
          idempotencyKey,
          requestHash,
        );
        if (duplicate) return duplicate;
      }
      if (isPrismaCode(error, "P2034") && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("Checkout transaction retry limit reached");
}
