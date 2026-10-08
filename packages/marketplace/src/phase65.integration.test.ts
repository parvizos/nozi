import { createHash, randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import {
  auth,
  buildActorContext,
  Permission,
  verifyPassword,
  type ActorContext,
} from "@nozi/auth";
import { resetEnvCacheForTests } from "@nozi/config";
import {
  CourierAssignmentStatus,
  CourierStatus,
  LedgerDirection,
  OrderStatus,
  PaymentMethod,
  Prisma,
  ProductStatus,
  UserRoleCode,
  UserStatus,
  prisma,
  seedMarketplace,
} from "@nozi/database";

import {
  createCourier,
  getCourierCashBalances,
  getFinanceOverview,
  recordCourierCashSettlement,
  updateAdminCustomer,
  updateAdminStore,
} from "./admin";
import { activateCourier, resendCourierInvitation } from "./courier-activation";
import { listCourierHistory } from "./courier";
import {
  getDevelopmentDeliveryCode,
  issueDeliveryProof,
  verifyDeliveryProof,
} from "./delivery-proof";
import { expireStaleOrders } from "./reservation-expiry";
import {
  postCashCollectionLedger,
  postOrderLedger,
  reverseOrderLedger,
} from "./ledger";
import { transitionOrder } from "./order-state-machine";
import { getPaymentProvider } from "./payments";
import { sellerProductInputSchema } from "./seller-contracts";

async function actor(
  role: UserRoleCode,
  permissions: string[] = [],
): Promise<ActorContext> {
  const id = randomUUID();
  const user = await prisma.user.create({
    data: { email: `phase65-${id}@nozi.test`, id, name: `Phase 6.5 ${role}` },
  });
  const roleRow = await prisma.role.findUniqueOrThrow({
    where: { code: role },
  });
  await prisma.userRole.create({ data: { roleId: roleRow.id, userId: id } });
  return buildActorContext({
    explicitPermissions: permissions,
    roles: [role],
    status: user.status,
    userId: id,
  });
}

beforeAll(async () => {
  await seedMarketplace();
});

describe.sequential("Phase 6.5 payment and accounting hardening", () => {
  it("rejects TEST through the backend when disabled and keeps CASH available", () => {
    const previous = process.env.ENABLE_TEST_PAYMENTS;
    process.env.ENABLE_TEST_PAYMENTS = "false";
    resetEnvCacheForTests();
    expect(() => getPaymentProvider("TEST")).toThrowError(
      expect.objectContaining({ code: "PAYMENT_METHOD_UNAVAILABLE" }),
    );
    expect(getPaymentProvider("CASH").method).toBe("CASH");
    process.env.ENABLE_TEST_PAYMENTS = previous ?? "true";
    resetEnvCacheForTests();
  });

  it.each([
    ["0.00", "0.00"],
    ["0.00", "15.00"],
    ["100.00", "0.00"],
    ["15.00", "25.00"],
  ])(
    "omits zero ledger components for commission %s and delivery %s",
    async (commission, delivery) => {
      const seller = await prisma.seller.findFirstOrThrow();
      const orderId = randomUUID();
      const items = new Prisma.Decimal("100.00");
      await prisma.$transaction((tx) =>
        postOrderLedger(tx, {
          commissionAmount: new Prisma.Decimal(commission),
          currencyCode: "TJS",
          deliveryFee: new Prisma.Decimal(delivery),
          grandTotal: items.add(delivery),
          itemsSubtotal: items,
          orderId,
          sellerId: seller.id,
        }),
      );
      const transaction = await prisma.ledgerTransaction.findFirstOrThrow({
        include: { entries: true },
        where: { eventType: "ORDER_PLACED", referenceId: orderId },
      });
      expect(
        transaction.entries.every((entry) => entry.amount.greaterThan(0)),
      ).toBe(true);
      const debit = transaction.entries
        .filter((entry) => entry.direction === LedgerDirection.DEBIT)
        .reduce((sum, entry) => sum.add(entry.amount), new Prisma.Decimal(0));
      const credit = transaction.entries
        .filter((entry) => entry.direction === LedgerDirection.CREDIT)
        .reduce((sum, entry) => sum.add(entry.amount), new Prisma.Decimal(0));
      expect(debit.equals(credit)).toBe(true);
      await prisma.$transaction((tx) => reverseOrderLedger(tx, orderId, null));
      expect(
        await prisma.ledgerEntry.count({ where: { amount: { equals: 0 } } }),
      ).toBe(0);
    },
  );

  it("records idempotent courier cash settlements without over-settlement", async () => {
    const admin = await actor(UserRoleCode.ADMIN, [
      Permission.AdminAccess,
      Permission.FinanceRead,
      Permission.FinanceCashManage,
    ]);
    const courier = await prisma.courier.findFirstOrThrow({
      where: { isActive: true },
    });
    await prisma.$transaction((tx) =>
      postCashCollectionLedger(tx, {
        amount: new Prisma.Decimal("75.50"),
        courierId: courier.id,
        currencyCode: "TJS",
        orderId: randomUUID(),
        userId: admin.userId,
      }),
    );
    const idempotencyKey = randomUUID();
    const input = {
      amount: "25.50",
      courierId: courier.id,
      currencyCode: "TJS",
      idempotencyKey,
      reason: "Cash received at operations desk",
      reference: "SHIFT-65",
    };
    const first = await recordCourierCashSettlement(admin, input);
    const second = await recordCourierCashSettlement(admin, input);
    expect(second.id).toBe(first.id);
    await expect(
      recordCourierCashSettlement(admin, {
        ...input,
        amount: "9999.00",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "CASH_SETTLEMENT_CONFLICT" });
    const balance = (await getCourierCashBalances(admin)).find(
      (row) => row.courier?.id === courier.id,
    );
    expect(Number(balance?.outstanding)).toBeGreaterThanOrEqual(50);
  });

  it("derives finance aggregates from balanced ledger reversals", async () => {
    const admin = await actor(UserRoleCode.ADMIN, [
      Permission.AdminAccess,
      Permission.FinanceRead,
    ]);
    const seller = await prisma.seller.findFirstOrThrow();
    const before = await getFinanceOverview(admin, {});
    const orderId = randomUUID();
    await prisma.$transaction((tx) =>
      postOrderLedger(tx, {
        commissionAmount: new Prisma.Decimal("15.00"),
        currencyCode: "TJS",
        deliveryFee: new Prisma.Decimal("25.00"),
        grandTotal: new Prisma.Decimal("125.00"),
        itemsSubtotal: new Prisma.Decimal("100.00"),
        orderId,
        sellerId: seller.id,
      }),
    );
    await prisma.$transaction((tx) =>
      reverseOrderLedger(tx, orderId, admin.userId),
    );
    const after = await getFinanceOverview(admin, {});
    expect(after.gmv).toBe(before.gmv);
    expect(after.marketplaceCommission).toBe(before.marketplaceCommission);
    expect(after.sellerAmount).toBe(before.sellerAmount);
  });
});

describe.sequential("Phase 6.5 courier and security hardening", () => {
  it("activates a real invited courier once and supports credential login", async () => {
    const admin = await actor(UserRoleCode.ADMIN, [
      Permission.AdminAccess,
      Permission.CouriersManage,
    ]);
    const email = `courier-invite-${randomUUID()}@nozi.test`;
    const created = await createCourier(
      admin,
      {
        email,
        name: "Pilot Courier",
        phoneE164: `+992${Math.floor(100000000 + Math.random() * 899999999)}`,
        status: CourierStatus.OFFLINE,
      },
      randomUUID(),
    );
    expect(created.activationUrl).toContain("/activate/courier/");
    const token = created.activationUrl!.split("/").pop()!;
    const password = "PilotCourierSecure123";
    await expect(activateCourier(token, { password })).resolves.toMatchObject({
      activated: true,
    });
    await expect(activateCourier(token, { password })).rejects.toMatchObject({
      code: "COURIER_INVITATION_USED",
    });
    const account = await prisma.account.findFirstOrThrow({
      where: { providerId: "credential", userId: created.userId },
    });
    expect(account.password).not.toBe(password);
    expect(await verifyPassword({ hash: account.password!, password })).toBe(
      true,
    );
    await expect(
      auth.api.signInEmail({ body: { email, password } }),
    ).resolves.toBeTruthy();
  });

  it("rejects expired and suspended courier invitations", async () => {
    const admin = await actor(UserRoleCode.ADMIN, [
      Permission.AdminAccess,
      Permission.CouriersManage,
    ]);
    for (const suspended of [false, true]) {
      const created = await createCourier(admin, {
        email: `courier-block-${randomUUID()}@nozi.test`,
        name: "Blocked Courier",
        phoneE164: `+992${Math.floor(100000000 + Math.random() * 899999999)}`,
        status: CourierStatus.OFFLINE,
      });
      const token = created.activationUrl!.split("/").pop()!;
      if (suspended) {
        await prisma.courier.update({
          data: { status: CourierStatus.SUSPENDED },
          where: { id: created.id },
        });
      } else {
        await prisma.courierInvitation.update({
          data: { expiresAt: new Date(Date.now() - 1_000) },
          where: {
            tokenHash: createHash("sha256").update(token).digest("hex"),
          },
        });
      }
      await expect(
        activateCourier(token, { password: "PilotCourierSecure123" }),
      ).rejects.toMatchObject({
        code: suspended
          ? "COURIER_ACTIVATION_BLOCKED"
          : "COURIER_INVITATION_EXPIRED",
      });
    }
  });

  it("invalidates the previous token when an invitation is resent", async () => {
    const admin = await actor(UserRoleCode.ADMIN, [
      Permission.AdminAccess,
      Permission.CouriersManage,
    ]);
    const created = await createCourier(admin, {
      email: `courier-resend-${randomUUID()}@nozi.test`,
      name: "Resent Invitation Courier",
      phoneE164: `+992${Math.floor(100000000 + Math.random() * 899999999)}`,
      status: CourierStatus.OFFLINE,
    });
    const oldToken = created.activationUrl!.split("/").pop()!;
    const replacement = await resendCourierInvitation(
      admin,
      created.id,
      randomUUID(),
    );
    await expect(
      activateCourier(oldToken, { password: "PilotCourierSecure123" }),
    ).rejects.toMatchObject({ code: "COURIER_INVITATION_USED" });
    await expect(
      activateCourier(replacement.token, {
        password: "PilotCourierSecure123",
      }),
    ).resolves.toMatchObject({ activated: true });
    await expect(
      activateCourier(randomUUID(), { password: "PilotCourierSecure123" }),
    ).rejects.toMatchObject({ code: "COURIER_INVITATION_INVALID" });
  });

  it("enforces courier ownership inside the order state machine", async () => {
    const assignment = await prisma.courierAssignment.findFirstOrThrow({
      include: { order: true },
      where: {
        order: { status: OrderStatus.COURIER_ASSIGNED },
        status: CourierAssignmentStatus.ASSIGNED,
      },
    });
    const attacker = await actor(UserRoleCode.COURIER);
    await prisma.courier.create({
      data: {
        name: "Wrong Courier",
        phoneE164: `+992${Math.floor(100000000 + Math.random() * 899999999)}`,
        status: CourierStatus.AVAILABLE,
        userId: attacker.userId,
      },
    });
    await expect(
      transitionOrder(attacker, {
        newStatus: OrderStatus.PICKED_UP,
        orderId: assignment.orderId,
      }),
    ).rejects.toMatchObject({ code: "INVALID_ORDER_TRANSITION" });
  });

  it("returns a PII-minimized history DTO", async () => {
    const delivered = await prisma.courierAssignment.findFirstOrThrow({
      include: { courier: true },
      where: { status: CourierAssignmentStatus.DELIVERED },
    });
    const courierActor = buildActorContext({
      roles: [UserRoleCode.COURIER],
      status: UserStatus.ACTIVE,
      userId: delivered.courier.userId,
    });
    const history = await listCourierHistory(courierActor, {
      page: 1,
      pageSize: 20,
    });
    const json = JSON.stringify(history);
    expect(json).not.toMatch(/recipientPhone|giftMessage|deliveryNote|line1/);
    expect(history.items[0]).toHaveProperty("deliveryArea");
  });

  it("protects admin accounts and the acting user from customer-management mutation", async () => {
    const manager = await actor(UserRoleCode.ADMIN, [
      Permission.AdminAccess,
      Permission.CustomersManage,
    ]);
    const customerRole = await prisma.role.findUniqueOrThrow({
      where: { code: UserRoleCode.CUSTOMER },
    });
    await prisma.userRole.create({
      data: { roleId: customerRole.id, userId: manager.userId },
    });
    await expect(
      updateAdminCustomer(manager, manager.userId, UserStatus.SUSPENDED),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const target = await actor(UserRoleCode.ADMIN);
    await prisma.userRole.create({
      data: { roleId: customerRole.id, userId: target.userId },
    });
    await expect(
      updateAdminCustomer(manager, target.userId, UserStatus.SUSPENDED),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires finance commission permission, reason and immutable history", async () => {
    const store = await prisma.store.findFirstOrThrow();
    const storeAdmin = await actor(UserRoleCode.ADMIN, [
      Permission.AdminAccess,
      Permission.StoresManage,
    ]);
    await expect(
      updateAdminStore(storeAdmin, store.id, {
        commissionRate: "19.50",
        commissionReason: "Pilot pricing policy",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const finance = await actor(UserRoleCode.ADMIN, [
      Permission.AdminAccess,
      Permission.FinanceCommissionManage,
    ]);
    await updateAdminStore(finance, store.id, {
      commissionRate: "19.50",
      commissionReason: "Pilot pricing policy",
    });
    expect(
      await prisma.commissionRateHistory.findFirst({
        where: { sellerId: store.sellerId },
      }),
    ).toMatchObject({ reason: "Pilot pricing policy" });
  });

  it("prevents sellers from submitting ACTIVE products", () => {
    expect(() =>
      sellerProductInputSchema.parse({
        categoryId: randomUUID(),
        compareAtPrice: null,
        description: "A valid long product description for moderation",
        images: [],
        name: "Moderated product",
        preparationTimeMinutes: 30,
        price: "49.50",
        slug: "moderated-product",
        status: ProductStatus.ACTIVE,
        stockQuantity: 5,
        storeId: randomUUID(),
        variants: [],
      }),
    ).toThrow();
  });

  it("expires stale seller-confirmation reservations idempotently", async () => {
    const customer = await actor(UserRoleCode.CUSTOMER);
    const product = await prisma.product.findFirstOrThrow({
      include: {
        store: { select: { cityId: true } },
        variants: { take: 1, where: { isActive: true } },
      },
      where: { status: ProductStatus.ACTIVE },
    });
    const variant = product.variants[0];
    const order = await prisma.$transaction(async (tx) => {
      await tx.product.update({
        data: { reservedQuantity: { increment: 1 } },
        where: { id: product.id },
      });
      if (variant) {
        await tx.productVariant.update({
          data: { reservedQuantity: { increment: 1 } },
          where: { id: variant.id },
        });
      }
      return tx.order.create({
        data: {
          anonymousDelivery: false,
          buyerName: "Reservation expiry test",
          buyerPhoneE164: "+992900000001",
          cityId: product.store.cityId,
          currencyCode: "TJS",
          customerUserId: customer.userId,
          deliveryFee: 0,
          discountTotal: 0,
          grandTotal: product.price,
          inventoryReservations: {
            create: {
              expiresAt: new Date(Date.now() - 1_000),
              productId: product.id,
              productVariantId: variant?.id ?? null,
              quantity: 1,
            },
          },
          itemsSubtotal: product.price,
          orderNumber: `NZ-EXP-${randomUUID().slice(0, 8).toUpperCase()}`,
          paymentMethod: PaymentMethod.CASH,
          recipientName: "Reservation expiry recipient",
          recipientPhoneE164: "+992900000002",
          requestedDeliveryDate: new Date("2026-10-10T00:00:00.000Z"),
          requestedDeliveryWindowEnd: new Date("1970-01-01T14:00:00.000Z"),
          requestedDeliveryWindowStart: new Date("1970-01-01T12:00:00.000Z"),
          status: OrderStatus.AWAITING_SELLER_CONFIRMATION,
          storeId: product.storeId,
        },
      });
    });
    expect((await expireStaleOrders()).expiredOrderIds).toContain(order.id);
    expect((await expireStaleOrders()).expiredOrderIds).not.toContain(order.id);
    expect(
      await prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
    ).toMatchObject({ status: OrderStatus.CANCELLED });
    expect(
      await prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
    ).toMatchObject({
      reservedQuantity: product.reservedQuantity,
    });
  });

  it("keeps delivery codes hashed and validates the recipient code", async () => {
    const previous = process.env.ENABLE_DELIVERY_CODES;
    process.env.ENABLE_DELIVERY_CODES = "true";
    resetEnvCacheForTests();
    const order = await prisma.order.findFirstOrThrow();
    await prisma.$transaction((tx) => issueDeliveryProof(tx, order.id));
    const admin = await actor(UserRoleCode.ADMIN, [
      Permission.AdminAccess,
      Permission.OrdersManage,
    ]);
    const { code } = await getDevelopmentDeliveryCode(admin, order.orderNumber);
    const proof = await prisma.deliveryProof.findUniqueOrThrow({
      where: { orderId: order.id },
    });
    expect(proof.codeHash).not.toContain(code);
    expect(
      await prisma.$transaction((tx) =>
        verifyDeliveryProof(tx, order.id, code),
      ),
    ).toBe("VALID");
    process.env.ENABLE_DELIVERY_CODES = previous ?? "false";
    resetEnvCacheForTests();
  });

  it("locks a delivery code after the configured number of failed attempts", async () => {
    const previous = process.env.ENABLE_DELIVERY_CODES;
    process.env.ENABLE_DELIVERY_CODES = "true";
    resetEnvCacheForTests();
    try {
      const order = await prisma.order.findFirstOrThrow();
      await prisma.$transaction((tx) => issueDeliveryProof(tx, order.id));
      const admin = await actor(UserRoleCode.ADMIN, [
        Permission.AdminAccess,
        Permission.OrdersManage,
      ]);
      const { code } = await getDevelopmentDeliveryCode(
        admin,
        order.orderNumber,
      );
      const wrongCode = code === "000000" ? "000001" : "000000";
      const proof = await prisma.deliveryProof.findUniqueOrThrow({
        where: { orderId: order.id },
      });
      for (let attempt = 0; attempt < proof.maxAttempts; attempt += 1) {
        await expect(
          prisma.$transaction((tx) =>
            verifyDeliveryProof(tx, order.id, wrongCode),
          ),
        ).resolves.toBe("INVALID");
      }
      await expect(
        prisma.$transaction((tx) =>
          verifyDeliveryProof(tx, order.id, wrongCode),
        ),
      ).rejects.toMatchObject({ code: "DELIVERY_CODE_LOCKED" });
    } finally {
      process.env.ENABLE_DELIVERY_CODES = previous ?? "false";
      resetEnvCacheForTests();
    }
  });
});
