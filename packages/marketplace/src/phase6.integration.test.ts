import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { buildActorContext, Permission, type ActorContext } from "@nozi/auth";
import { resetEnvCacheForTests } from "@nozi/config";
import {
  CourierAssignmentStatus,
  CourierStatus,
  DeliveryFailureReason,
  InventoryReservationStatus,
  LedgerDirection,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  SellerStatus,
  SellerUserRole,
  StoreStatus,
  UserRoleCode,
  UserStatus,
  prisma,
  seedMarketplace,
} from "@nozi/database";

import {
  adminCancelOrder,
  assignCourier,
  retryFailedDelivery,
  startFailedDeliveryReturn,
} from "./admin";
import { addCartItem } from "./cart";
import { placeOrder } from "./checkout";
import type { CheckoutInput } from "./checkout-contracts";
import {
  activeCourierAssignmentStatuses,
  getCourierDelivery,
  listCourierDeliveries,
  recordCourierLocation,
  reportCourierDeliveryFailure,
  transitionCourierDelivery,
} from "./courier";
import { courierFailureSchema } from "./courier-contracts";
import { getDevelopmentDeliveryCode } from "./delivery-proof";
import { transitionOrder } from "./order-state-machine";
import { getCustomerOrder } from "./orders";

let fixtureProductId = "";
let fixtureVariantId = "";
let fixtureSellerId = "";

function actor(
  userId: string,
  role: UserRoleCode,
  permissions: string[] = [],
): ActorContext {
  return buildActorContext({
    explicitPermissions: permissions,
    roles: [role],
    status: UserStatus.ACTIVE,
    userId,
  });
}

async function user(role: UserRoleCode, permissions: string[] = []) {
  const id = randomUUID();
  const row = await prisma.user.create({
    data: { email: `phase6-${id}@nozi.test`, id, name: `Phase 6 ${role}` },
  });
  const roleRow = await prisma.role.upsert({
    create: { code: role, description: `${role} integration role` },
    update: {},
    where: { code: role },
  });
  await prisma.userRole.create({
    data: { roleId: roleRow.id, userId: row.id },
  });
  return actor(row.id, role, permissions);
}

const operationsPermissions = [
  Permission.AdminAccess,
  Permission.OrdersManage,
  Permission.OrdersRead,
  Permission.CouriersManage,
];

function checkoutInput(paymentMethod: "CASH" | "TEST"): CheckoutInput {
  return {
    anonymousDelivery: false,
    apartment: "12",
    buyerName: "Courier Flow Buyer",
    buyerPhone: "+992900001234",
    customerNote: undefined,
    deliveryAddress: "проспект Рудаки, 120",
    deliveryDate: new Date(Date.now() + 172_800_000).toISOString().slice(0, 10),
    deliveryNote: "Позвонить за пять минут",
    deliveryWindowEnd: "16:00",
    deliveryWindowStart: "14:00",
    entrance: "2",
    floor: "4",
    giftMessage: "С праздником!",
    paymentMethod,
    recipientName: "Получатель",
    recipientPhone: "+992900005678",
  };
}

async function courier(status = CourierStatus.AVAILABLE) {
  const courierActor = await user(UserRoleCode.COURIER);
  const profile = await prisma.courier.create({
    data: {
      isActive: true,
      name: "Phase 6 Courier",
      phoneE164: `+992${Math.floor(100000000 + Math.random() * 899999999)}`,
      status,
      userId: courierActor.userId,
    },
  });
  return { actor: courierActor, profile };
}

async function readyAssignment(paymentMethod: "CASH" | "TEST" = "CASH") {
  const customer = await user(UserRoleCode.CUSTOMER);
  await addCartItem(customer, {
    productId: fixtureProductId,
    productVariantId: fixtureVariantId,
    quantity: 1,
  });
  const placed = await placeOrder(customer, checkoutInput(paymentMethod), {
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
  });
  const seller = await user(UserRoleCode.SELLER);
  await prisma.sellerUser.create({
    data: {
      sellerId: fixtureSellerId,
      sellerRole: SellerUserRole.OPERATOR,
      userId: seller.userId,
    },
  });
  for (const status of [
    OrderStatus.CONFIRMED,
    OrderStatus.PREPARING,
    OrderStatus.READY_FOR_PICKUP,
  ]) {
    await transitionOrder(seller, {
      newStatus: status,
      orderId: placed.orderId,
    });
  }
  const admin = await user(UserRoleCode.ADMIN, operationsPermissions);
  const assignedCourier = await courier();
  await assignCourier(
    admin,
    placed.orderNumber,
    assignedCourier.profile.id,
    randomUUID(),
  );
  return {
    admin,
    courier: assignedCourier,
    customer,
    order: await prisma.order.findUniqueOrThrow({
      where: { id: placed.orderId },
    }),
  };
}

async function advance(
  courierActor: ActorContext,
  orderNumber: string,
  actions: ("ACCEPT" | "ARRIVE" | "PICKUP" | "START" | "DELIVER")[],
) {
  for (const action of actions) {
    await transitionCourierDelivery(
      courierActor,
      orderNumber,
      action,
      randomUUID(),
    );
  }
}

beforeAll(async () => {
  await seedMarketplace();
  const city = await prisma.city.findFirstOrThrow({
    where: { isActive: true },
  });
  const category = await prisma.category.findFirstOrThrow({
    where: { isActive: true },
  });
  const seller = await prisma.seller.create({
    data: {
      legalName: "Phase 6 Delivery Seller",
      publicName: "Phase 6 Store",
      status: SellerStatus.APPROVED,
    },
  });
  fixtureSellerId = seller.id;
  const store = await prisma.store.create({
    data: {
      cityId: city.id,
      deliveryFeeAmount: "25.00",
      description: "Isolated store for courier integration tests",
      isActive: true,
      isOpen: true,
      name: "Phase 6 Store",
      phoneE164: "+992900006600",
      sellerId: seller.id,
      slug: `phase6-store-${randomUUID()}`,
      status: StoreStatus.ACTIVE,
    },
  });
  await prisma.storeAddress.create({
    data: { cityId: city.id, line1: "Phase 6 pickup point", storeId: store.id },
  });
  await prisma.storeOpeningHour.createMany({
    data: Array.from({ length: 7 }, (_, index) => ({
      closesAt: "23:59",
      dayOfWeek: index + 1,
      isClosed: false,
      opensAt: "00:00",
      storeId: store.id,
    })),
  });
  const product = await prisma.product.create({
    data: {
      categoryId: category.id,
      currencyCode: "TJS",
      description: "Dedicated product for delivery workflow tests",
      name: "Phase 6 Delivery Product",
      price: "100.00",
      slug: `phase6-product-${randomUUID()}`,
      status: ProductStatus.ACTIVE,
      stockQuantity: 100,
      storeId: store.id,
    },
  });
  const variant = await prisma.productVariant.create({
    data: {
      name: "Standard",
      productId: product.id,
      sku: `PHASE6-${randomUUID()}`,
      stockQuantity: 100,
    },
  });
  fixtureProductId = product.id;
  fixtureVariantId = variant.id;
});

describe.sequential("courier authorization and lifecycle", () => {
  it("shows only the authenticated courier's assignment", async () => {
    const first = await readyAssignment();
    const second = await courier();
    await expect(
      getCourierDelivery(first.courier.actor, first.order.orderNumber),
    ).resolves.toMatchObject({ courierId: first.courier.profile.id });
    await expect(
      getCourierDelivery(second.actor, first.order.orderNumber),
    ).rejects.toMatchObject({ code: "COURIER_DELIVERY_NOT_FOUND" });
    const list = await listCourierDeliveries(first.courier.actor, {
      page: 1,
      pageSize: 20,
      scope: "ACTIVE",
    });
    expect(
      list.items.every((item) => item.courierId === first.courier.profile.id),
    ).toBe(true);
  });

  it("blocks suspended couriers from actions", async () => {
    const fixture = await readyAssignment();
    await prisma.courier.update({
      data: { status: CourierStatus.SUSPENDED },
      where: { id: fixture.courier.profile.id },
    });
    await expect(
      transitionCourierDelivery(
        fixture.courier.actor,
        fixture.order.orderNumber,
        "ACCEPT",
      ),
    ).rejects.toMatchObject({ code: "ACCOUNT_INACTIVE" });
  });

  it("runs the complete lifecycle and atomically finalizes cash delivery", async () => {
    const fixture = await readyAssignment("CASH");
    const before = await prisma.product.findUniqueOrThrow({
      where: { id: fixtureProductId },
    });
    const previousDeliveryCodes = process.env.ENABLE_DELIVERY_CODES;
    process.env.ENABLE_DELIVERY_CODES = "true";
    resetEnvCacheForTests();
    try {
      await advance(fixture.courier.actor, fixture.order.orderNumber, [
        "ACCEPT",
        "ARRIVE",
        "PICKUP",
        "START",
      ]);
      const { code } = await getDevelopmentDeliveryCode(
        fixture.admin,
        fixture.order.orderNumber,
      );
      await transitionCourierDelivery(
        fixture.courier.actor,
        fixture.order.orderNumber,
        "DELIVER",
        randomUUID(),
        { deliveryCode: code },
      );
    } finally {
      process.env.ENABLE_DELIVERY_CODES = previousDeliveryCodes ?? "false";
      resetEnvCacheForTests();
    }
    const [
      order,
      assignment,
      profile,
      reservation,
      payment,
      product,
      cashLedger,
    ] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } }),
      prisma.courierAssignment.findFirstOrThrow({
        where: { orderId: fixture.order.id },
      }),
      prisma.courier.findUniqueOrThrow({
        where: { id: fixture.courier.profile.id },
      }),
      prisma.inventoryReservation.findFirstOrThrow({
        where: { orderId: fixture.order.id },
      }),
      prisma.payment.findUniqueOrThrow({
        where: { orderId: fixture.order.id },
      }),
      prisma.product.findUniqueOrThrow({ where: { id: fixtureProductId } }),
      prisma.ledgerTransaction.findUniqueOrThrow({
        include: { entries: true },
        where: {
          referenceType_referenceId_eventType: {
            eventType: "CASH_COLLECTED",
            referenceId: fixture.order.id,
            referenceType: "ORDER",
          },
        },
      }),
    ]);
    expect(order.status).toBe(OrderStatus.DELIVERED);
    await expect(
      getCustomerOrder(fixture.customer, fixture.order.orderNumber),
    ).resolves.toMatchObject({ status: OrderStatus.DELIVERED });
    expect(assignment.status).toBe(CourierAssignmentStatus.DELIVERED);
    expect(assignment.acceptedAt).not.toBeNull();
    expect(assignment.arrivedAtStoreAt).not.toBeNull();
    expect(assignment.pickedUpAt).not.toBeNull();
    expect(assignment.onTheWayAt).not.toBeNull();
    expect(assignment.deliveredAt).not.toBeNull();
    expect(profile.status).toBe(CourierStatus.AVAILABLE);
    expect(reservation.status).toBe(InventoryReservationStatus.CONSUMED);
    expect(payment.status).toBe(PaymentStatus.PAID);
    expect(payment.paidAt).not.toBeNull();
    expect(product.stockQuantity).toBe(before.stockQuantity - 1);
    expect(product.reservedQuantity).toBe(before.reservedQuantity - 1);
    const debit = cashLedger.entries
      .filter((entry) => entry.direction === LedgerDirection.DEBIT)
      .reduce(
        (sum, entry) => sum.add(entry.amount),
        cashLedger.entries[0]!.amount.mul(0),
      );
    const credit = cashLedger.entries
      .filter((entry) => entry.direction === LedgerDirection.CREDIT)
      .reduce(
        (sum, entry) => sum.add(entry.amount),
        cashLedger.entries[0]!.amount.mul(0),
      );
    expect(debit.equals(credit)).toBe(true);
    expect(
      await prisma.auditLog.count({
        where: {
          actorUserId: fixture.courier.actor.userId,
          subjectId: assignment.id,
        },
      }),
    ).toBe(5);
  });

  it("does not let another courier consume delivery-code attempts", async () => {
    const fixture = await readyAssignment();
    const attacker = await courier();
    const previousDeliveryCodes = process.env.ENABLE_DELIVERY_CODES;
    process.env.ENABLE_DELIVERY_CODES = "true";
    resetEnvCacheForTests();
    try {
      await advance(fixture.courier.actor, fixture.order.orderNumber, [
        "ACCEPT",
        "ARRIVE",
        "PICKUP",
        "START",
      ]);
      const proof = await prisma.deliveryProof.findUniqueOrThrow({
        where: { orderId: fixture.order.id },
      });
      await expect(
        transitionCourierDelivery(
          attacker.actor,
          fixture.order.orderNumber,
          "DELIVER",
          randomUUID(),
          { deliveryCode: "000000" },
        ),
      ).rejects.toMatchObject({ code: "COURIER_DELIVERY_NOT_FOUND" });
      await expect(
        prisma.deliveryProof.findUniqueOrThrow({
          where: { orderId: fixture.order.id },
        }),
      ).resolves.toMatchObject({ attemptCount: proof.attemptCount });
    } finally {
      process.env.ENABLE_DELIVERY_CODES = previousDeliveryCodes ?? "false";
      resetEnvCacheForTests();
    }
  });

  it("rejects skipped delivery stages", async () => {
    const fixture = await readyAssignment();
    await expect(
      transitionCourierDelivery(
        fixture.courier.actor,
        fixture.order.orderNumber,
        "DELIVER",
      ),
    ).rejects.toMatchObject({ code: "COURIER_ACTION_CONFLICT" });
    await transitionCourierDelivery(
      fixture.courier.actor,
      fixture.order.orderNumber,
      "ACCEPT",
    );
    await expect(
      transitionCourierDelivery(
        fixture.courier.actor,
        fixture.order.orderNumber,
        "PICKUP",
      ),
    ).rejects.toMatchObject({ code: "COURIER_ACTION_CONFLICT" });
  });
});

describe.sequential("courier failures, location and concurrency", () => {
  it("requires a structured failure reason and raises admin attention", async () => {
    expect(() =>
      courierFailureSchema.parse({ reason: DeliveryFailureReason.OTHER }),
    ).toThrow();
    const fixture = await readyAssignment();
    await transitionCourierDelivery(
      fixture.courier.actor,
      fixture.order.orderNumber,
      "ACCEPT",
    );
    await reportCourierDeliveryFailure(
      fixture.courier.actor,
      fixture.order.orderNumber,
      {
        note: "Recipient does not answer",
        reason: DeliveryFailureReason.CANNOT_CONTACT,
      },
    );
    const assignment = await prisma.courierAssignment.findFirstOrThrow({
      include: { failures: true },
      where: { orderId: fixture.order.id },
    });
    expect(assignment.requiresAdminAttention).toBe(true);
    expect(assignment.status).toBe(CourierAssignmentStatus.DELIVERY_FAILED);
    expect(assignment.failures).toHaveLength(1);
    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } }),
    ).resolves.toMatchObject({ status: OrderStatus.DELIVERY_FAILED });
  });

  it("records location only for the courier's active delivery", async () => {
    const fixture = await readyAssignment();
    const other = await courier();
    await expect(
      recordCourierLocation(fixture.courier.actor, {
        accuracy: 8,
        latitude: 38.573,
        longitude: 68.787,
        orderNumber: fixture.order.orderNumber,
      }),
    ).resolves.toMatchObject({ latitude: "38.573000" });
    await expect(
      recordCourierLocation(other.actor, {
        latitude: 38.573,
        longitude: 68.787,
        orderNumber: fixture.order.orderNumber,
      }),
    ).rejects.toMatchObject({ code: "COURIER_DELIVERY_NOT_FOUND" });
  });

  it("makes double pickup safe", async () => {
    const fixture = await readyAssignment();
    await advance(fixture.courier.actor, fixture.order.orderNumber, [
      "ACCEPT",
      "ARRIVE",
    ]);
    const results = await Promise.allSettled([
      transitionCourierDelivery(
        fixture.courier.actor,
        fixture.order.orderNumber,
        "PICKUP",
      ),
      transitionCourierDelivery(
        fixture.courier.actor,
        fixture.order.orderNumber,
        "PICKUP",
      ),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      await prisma.orderStatusHistory.count({
        where: { newStatus: OrderStatus.PICKED_UP, orderId: fixture.order.id },
      }),
    ).toBe(1);
  });

  it("makes delivery retry idempotent without duplicate stock or ledger effects", async () => {
    const fixture = await readyAssignment();
    await advance(fixture.courier.actor, fixture.order.orderNumber, [
      "ACCEPT",
      "ARRIVE",
      "PICKUP",
      "START",
    ]);
    const results = await Promise.allSettled([
      transitionCourierDelivery(
        fixture.courier.actor,
        fixture.order.orderNumber,
        "DELIVER",
      ),
      transitionCourierDelivery(
        fixture.courier.actor,
        fixture.order.orderNumber,
        "DELIVER",
      ),
    ]);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    await expect(
      transitionCourierDelivery(
        fixture.courier.actor,
        fixture.order.orderNumber,
        "DELIVER",
      ),
    ).resolves.toMatchObject({ idempotent: true });
    expect(
      await prisma.ledgerTransaction.count({
        where: { eventType: "CASH_COLLECTED", referenceId: fixture.order.id },
      }),
    ).toBe(1);
    expect(
      await prisma.inventoryReservation.count({
        where: {
          orderId: fixture.order.id,
          status: InventoryReservationStatus.CONSUMED,
        },
      }),
    ).toBe(1);
  });

  it("keeps reassign/accept races consistent", async () => {
    const fixture = await readyAssignment();
    const replacement = await courier();
    await Promise.allSettled([
      transitionCourierDelivery(
        fixture.courier.actor,
        fixture.order.orderNumber,
        "ACCEPT",
      ),
      assignCourier(
        fixture.admin,
        fixture.order.orderNumber,
        replacement.profile.id,
        randomUUID(),
        true,
      ),
    ]);
    expect(
      await prisma.courierAssignment.count({
        where: {
          orderId: fixture.order.id,
          status: {
            in: [
              CourierAssignmentStatus.ASSIGNED,
              CourierAssignmentStatus.ACCEPTED,
              CourierAssignmentStatus.ARRIVED_AT_STORE,
              CourierAssignmentStatus.PICKED_UP,
              CourierAssignmentStatus.ON_THE_WAY,
            ],
          },
        },
      }),
    ).toBe(1);
  });

  it("keeps admin cancel/courier pickup races consistent", async () => {
    const fixture = await readyAssignment();
    await advance(fixture.courier.actor, fixture.order.orderNumber, [
      "ACCEPT",
      "ARRIVE",
    ]);
    await Promise.allSettled([
      transitionCourierDelivery(
        fixture.courier.actor,
        fixture.order.orderNumber,
        "PICKUP",
      ),
      adminCancelOrder(
        fixture.admin,
        fixture.order.orderNumber,
        "Concurrent operations cancellation",
      ),
    ]);
    const [order, assignment] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } }),
      prisma.courierAssignment.findFirstOrThrow({
        where: { orderId: fixture.order.id },
      }),
    ]);
    expect([OrderStatus.CANCELLED, OrderStatus.PICKED_UP]).toContain(
      order.status,
    );
    expect(
      order.status === OrderStatus.CANCELLED
        ? assignment.status === CourierAssignmentStatus.CANCELLED
        : assignment.status === CourierAssignmentStatus.PICKED_UP,
    ).toBe(true);
  });

  it("keeps TEST payment paid without creating a cash collection", async () => {
    const fixture = await readyAssignment("TEST");
    await advance(fixture.courier.actor, fixture.order.orderNumber, [
      "ACCEPT",
      "ARRIVE",
      "PICKUP",
      "START",
      "DELIVER",
    ]);
    expect(
      await prisma.payment.findUniqueOrThrow({
        where: { orderId: fixture.order.id },
      }),
    ).toMatchObject({ status: PaymentStatus.PAID });
    expect(
      await prisma.ledgerTransaction.count({
        where: { eventType: "CASH_COLLECTED", referenceId: fixture.order.id },
      }),
    ).toBe(0);
  });

  it("retries a failed delivery with the same courier", async () => {
    const fixture = await readyAssignment();
    await advance(fixture.courier.actor, fixture.order.orderNumber, [
      "ACCEPT",
      "ARRIVE",
      "PICKUP",
      "START",
    ]);
    await reportCourierDeliveryFailure(
      fixture.courier.actor,
      fixture.order.orderNumber,
      { reason: DeliveryFailureReason.RECIPIENT_UNAVAILABLE },
    );
    expect(
      await prisma.payment.findUniqueOrThrow({
        where: { orderId: fixture.order.id },
      }),
    ).toMatchObject({ status: PaymentStatus.PENDING });
    expect(
      await prisma.ledgerTransaction.count({
        where: { eventType: "CASH_COLLECTED", referenceId: fixture.order.id },
      }),
    ).toBe(0);

    await retryFailedDelivery(fixture.admin, fixture.order.orderNumber, {
      courierId: fixture.courier.profile.id,
      deliveryDate: checkoutInput("CASH").deliveryDate,
      deliveryWindowEnd: "16:00",
      deliveryWindowStart: "14:00",
    });
    expect(
      await prisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } }),
    ).toMatchObject({ status: OrderStatus.COURIER_ASSIGNED });

    const newAssignment = await prisma.courierAssignment.findFirstOrThrow({
      orderBy: { assignedAt: "desc" },
      where: { orderId: fixture.order.id },
    });
    expect(newAssignment.courierId).toBe(fixture.courier.profile.id);
    expect(
      await prisma.courierAssignment.count({
        where: {
          orderId: fixture.order.id,
          status: { in: [...activeCourierAssignmentStatuses] },
        },
      }),
    ).toBe(1);
  });

  it("retries a failed delivery with another courier and releases the previous courier", async () => {
    const fixture = await readyAssignment();
    const replacement = await courier();
    await advance(fixture.courier.actor, fixture.order.orderNumber, [
      "ACCEPT",
      "ARRIVE",
      "PICKUP",
      "START",
    ]);
    await reportCourierDeliveryFailure(
      fixture.courier.actor,
      fixture.order.orderNumber,
      { reason: DeliveryFailureReason.CANNOT_CONTACT },
    );

    await retryFailedDelivery(fixture.admin, fixture.order.orderNumber, {
      courierId: replacement.profile.id,
      deliveryDate: checkoutInput("CASH").deliveryDate,
      deliveryWindowEnd: "18:00",
      deliveryWindowStart: "16:00",
    });

    const currentAssignment = await prisma.courierAssignment.findFirstOrThrow({
      orderBy: { assignedAt: "desc" },
      where: { orderId: fixture.order.id },
    });
    expect(currentAssignment).toMatchObject({
      courierId: replacement.profile.id,
      status: CourierAssignmentStatus.ASSIGNED,
    });
    await expect(
      prisma.courier.findUniqueOrThrow({
        where: { id: fixture.courier.profile.id },
      }),
    ).resolves.toMatchObject({ status: CourierStatus.AVAILABLE });
    await expect(
      getCourierDelivery(fixture.courier.actor, fixture.order.orderNumber),
    ).rejects.toMatchObject({ code: "COURIER_DELIVERY_NOT_FOUND" });
  });

  it("cancels after delivery failure without false payment or inventory finalization", async () => {
    const fixture = await readyAssignment();
    await advance(fixture.courier.actor, fixture.order.orderNumber, [
      "ACCEPT",
      "ARRIVE",
      "PICKUP",
      "START",
    ]);
    await reportCourierDeliveryFailure(
      fixture.courier.actor,
      fixture.order.orderNumber,
      { reason: DeliveryFailureReason.RECIPIENT_REFUSED },
    );

    await adminCancelOrder(
      fixture.admin,
      fixture.order.orderNumber,
      "Recipient refused after failed delivery",
    );

    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } }),
    ).resolves.toMatchObject({ status: OrderStatus.CANCELLED });
    await expect(
      prisma.payment.findUniqueOrThrow({
        where: { orderId: fixture.order.id },
      }),
    ).resolves.toMatchObject({ status: PaymentStatus.CANCELLED });
    expect(
      await prisma.ledgerTransaction.count({
        where: { eventType: "CASH_COLLECTED", referenceId: fixture.order.id },
      }),
    ).toBe(0);
    await expect(
      prisma.inventoryReservation.findFirstOrThrow({
        where: { orderId: fixture.order.id },
      }),
    ).resolves.toMatchObject({ status: InventoryReservationStatus.RELEASED });
    await expect(
      prisma.courier.findUniqueOrThrow({
        where: { id: fixture.courier.profile.id },
      }),
    ).resolves.toMatchObject({ status: CourierStatus.AVAILABLE });
  });

  it("returns a failed parcel to stock and eventually releases the courier", async () => {
    const fixture = await readyAssignment();
    await advance(fixture.courier.actor, fixture.order.orderNumber, [
      "ACCEPT",
      "ARRIVE",
      "PICKUP",
      "START",
    ]);
    await reportCourierDeliveryFailure(
      fixture.courier.actor,
      fixture.order.orderNumber,
      { reason: DeliveryFailureReason.WRONG_ADDRESS },
    );
    await startFailedDeliveryReturn(fixture.admin, fixture.order.orderNumber);
    await transitionCourierDelivery(
      fixture.courier.actor,
      fixture.order.orderNumber,
      "RETURNED",
    );
    expect(
      await prisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } }),
    ).toMatchObject({ status: OrderStatus.RETURNED_TO_STORE });
    expect(
      await prisma.courier.findUniqueOrThrow({
        where: { id: fixture.courier.profile.id },
      }),
    ).toMatchObject({ status: CourierStatus.AVAILABLE });
    expect(
      await prisma.inventoryReservation.findMany({
        where: { orderId: fixture.order.id },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: InventoryReservationStatus.RELEASED,
        }),
      ]),
    );
    expect(
      await prisma.payment.findUniqueOrThrow({
        where: { orderId: fixture.order.id },
      }),
    ).toMatchObject({ status: PaymentStatus.PENDING });
  });
});
