import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { buildActorContext, Permission, type ActorContext } from "@nozi/auth";
import {
  CourierStatus,
  OrderStatus,
  ProductStatus,
  SellerStatus,
  SellerUserRole,
  UserRoleCode,
  UserStatus,
  prisma,
  seedMarketplace,
} from "@nozi/database";
import {
  adminCancelOrder,
  assignCourier,
  createCategory,
  getFinanceOverview,
  listAdminOrders,
  listAdminSellers,
  moderateProduct,
  updateAdminCustomer,
  updateAdminSeller,
  updateCategory,
  updateCourier,
} from "./admin";
import { addCartItem } from "./cart";
import { placeOrder } from "./checkout";
import type { CheckoutInput } from "./checkout-contracts";
import { transitionOrder } from "./order-state-machine";

function actor(
  userId: string,
  permissions: string[] = [],
  role: UserRoleCode = UserRoleCode.ADMIN,
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
    data: { email: `phase5-${id}@nozi.test`, id, name: `Phase 5 ${role}` },
  });
  const roleRow = await prisma.role.upsert({
    create: { code: role, description: `${role} integration role` },
    update: {},
    where: { code: role },
  });
  await prisma.userRole.create({
    data: { roleId: roleRow.id, userId: row.id },
  });
  return actor(row.id, permissions, role);
}
function checkoutInput(): CheckoutInput {
  return {
    anonymousDelivery: false,
    apartment: undefined,
    buyerName: "Admin Flow Buyer",
    buyerPhone: "+992900001234",
    customerNote: undefined,
    deliveryAddress: "Рудаки, 50",
    deliveryDate: new Date(Date.now() + 172_800_000).toISOString().slice(0, 10),
    deliveryNote: undefined,
    deliveryWindowEnd: "16:00",
    deliveryWindowStart: "14:00",
    entrance: undefined,
    floor: undefined,
    giftMessage: undefined,
    paymentMethod: "TEST",
    recipientName: "Recipient",
    recipientPhone: "+992900005678",
  };
}
async function orderFixture() {
  const customer = await user(UserRoleCode.CUSTOMER);
  const product = await prisma.product.findFirstOrThrow({
    include: {
      store: true,
      variants: {
        orderBy: { stockQuantity: "desc" },
        take: 1,
        where: { isActive: true },
      },
    },
    orderBy: { stockQuantity: "desc" },
    where: {
      status: ProductStatus.ACTIVE,
      store: {
        isActive: true,
        isOpen: true,
        isTemporarilyPaused: false,
        seller: { status: SellerStatus.APPROVED },
        status: "ACTIVE",
      },
    },
  });
  await addCartItem(customer, {
    productId: product.id,
    productVariantId: product.variants[0]!.id,
    quantity: 1,
  });
  const result = await placeOrder(customer, checkoutInput(), {
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
  });
  return {
    customer,
    order: await prisma.order.findUniqueOrThrow({
      where: { id: result.orderId },
    }),
    product,
  };
}
async function readyOrder() {
  const fixture = await orderFixture();
  const seller = await user(UserRoleCode.SELLER);
  await prisma.sellerUser.create({
    data: {
      sellerId: fixture.product.store.sellerId,
      sellerRole: SellerUserRole.OPERATOR,
      userId: seller.userId,
    },
  });
  await transitionOrder(seller, {
    newStatus: OrderStatus.CONFIRMED,
    orderId: fixture.order.id,
  });
  await transitionOrder(seller, {
    newStatus: OrderStatus.PREPARING,
    orderId: fixture.order.id,
  });
  await transitionOrder(seller, {
    newStatus: OrderStatus.READY_FOR_PICKUP,
    orderId: fixture.order.id,
  });
  return { ...fixture, seller };
}
async function courier(
  status: CourierStatus = CourierStatus.AVAILABLE,
  isActive = true,
) {
  const courierUser = await user(UserRoleCode.COURIER);
  return prisma.courier.create({
    data: {
      isActive,
      name: "Test Courier",
      phoneE164: `+9929${Math.floor(100000000 + Math.random() * 899999999)}`,
      status,
      userId: courierUser.userId,
    },
  });
}
const operationsPermissions = [
  Permission.AdminAccess,
  Permission.OrdersRead,
  Permission.OrdersManage,
  Permission.CouriersManage,
  Permission.SellersRead,
  Permission.SellersManage,
  Permission.CustomersRead,
  Permission.CustomersManage,
  Permission.AuditRead,
];

beforeAll(async () => {
  await seedMarketplace();
});

describe.sequential("admin permissions", () => {
  it("allows operations orders while separating support, finance and catalog capabilities", async () => {
    const operations = await user(UserRoleCode.ADMIN, operationsPermissions);
    await expect(
      listAdminOrders(operations, {
        page: 1,
        pageSize: 10,
        query: "",
        status: "ALL",
      }),
    ).resolves.toHaveProperty("items");
    const support = await user(UserRoleCode.ADMIN, [
      Permission.AdminAccess,
      Permission.OrdersRead,
      Permission.CustomersRead,
    ]);
    await expect(getFinanceOverview(support, {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const finance = await user(UserRoleCode.ADMIN, [
      Permission.AdminAccess,
      Permission.FinanceRead,
    ]);
    await expect(
      listAdminSellers(finance, { page: 1, pageSize: 10, query: "" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const catalog = await user(UserRoleCode.ADMIN, [
      Permission.AdminAccess,
      Permission.ProductsModerate,
    ]);
    const ready = await readyOrder();
    await expect(
      assignCourier(catalog, ready.order.orderNumber, (await courier()).id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe.sequential("admin order operations", () => {
  it("cancels transactionally, releases reservations and writes a redacted audit event", async () => {
    const admin = await user(UserRoleCode.ADMIN, operationsPermissions);
    const fixture = await orderFixture();
    const before = await prisma.product.findUniqueOrThrow({
      where: { id: fixture.product.id },
    });
    await adminCancelOrder(
      admin,
      fixture.order.orderNumber,
      "Customer requested cancellation",
      "phase5-cancel",
    );
    const after = await prisma.product.findUniqueOrThrow({
      where: { id: fixture.product.id },
    });
    expect(after.reservedQuantity).toBeLessThan(before.reservedQuantity);
    const log = await prisma.auditLog.findFirstOrThrow({
      orderBy: { createdAt: "desc" },
      where: {
        action: "order.status_changed",
        actorUserId: admin.userId,
        subjectId: fixture.order.id,
      },
    });
    expect(JSON.stringify(log)).not.toContain("+992900001234");
  });

  it("assigns one active courier and rejects inactive, duplicate and invalid-status assignments", async () => {
    const admin = await user(UserRoleCode.ADMIN, operationsPermissions);
    const ready = await readyOrder();
    const available = await courier();
    const assignment = await assignCourier(
      admin,
      ready.order.orderNumber,
      available.id,
      "assign-1",
    );
    expect(assignment.status).toBe("ASSIGNED");
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: ready.order.id } }))
        .status,
    ).toBe(OrderStatus.COURIER_ASSIGNED);
    await expect(
      assignCourier(admin, ready.order.orderNumber, (await courier()).id),
    ).rejects.toMatchObject({ code: "COURIER_ASSIGNMENT_CONFLICT" });
    const anotherReady = await readyOrder();
    const inactive = await courier(CourierStatus.SUSPENDED, false);
    await expect(
      assignCourier(admin, anotherReady.order.orderNumber, inactive.id),
    ).rejects.toMatchObject({ code: "COURIER_UNAVAILABLE" });
    const awaiting = await orderFixture();
    await expect(
      assignCourier(admin, awaiting.order.orderNumber, (await courier()).id),
    ).rejects.toMatchObject({ code: "INVALID_ORDER_TRANSITION" });
  });

  it("protects double assignment under concurrency", async () => {
    const admin = await user(UserRoleCode.ADMIN, operationsPermissions);
    const ready = await readyOrder();
    const first = await courier();
    const second = await courier();
    const results = await Promise.allSettled([
      assignCourier(admin, ready.order.orderNumber, first.id),
      assignCourier(admin, ready.order.orderNumber, second.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await prisma.courierAssignment.count({
        where: {
          orderId: ready.order.id,
          status: { in: ["ASSIGNED", "ACCEPTED", "PICKED_UP"] },
        },
      }),
    ).toBe(1);
  });

  it("keeps cancel and assignment races in one consistent terminal state", async () => {
    const admin = await user(UserRoleCode.ADMIN, operationsPermissions);
    const ready = await readyOrder();
    const available = await courier();
    await Promise.allSettled([
      assignCourier(admin, ready.order.orderNumber, available.id),
      adminCancelOrder(
        admin,
        ready.order.orderNumber,
        "Concurrent operations decision",
      ),
    ]);
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: ready.order.id },
    });
    const activeAssignments = await prisma.courierAssignment.count({
      where: {
        orderId: order.id,
        status: { in: ["ASSIGNED", "ACCEPTED", "PICKED_UP"] },
      },
    });
    expect([OrderStatus.CANCELLED, OrderStatus.COURIER_ASSIGNED]).toContain(
      order.status,
    );
    expect(activeAssignments).toBe(
      order.status === OrderStatus.COURIER_ASSIGNED ? 1 : 0,
    );
  });

  it("serializes seller acceptance against admin cancellation", async () => {
    const admin = await user(UserRoleCode.ADMIN, operationsPermissions);
    const fixture = await orderFixture();
    const seller = await user(UserRoleCode.SELLER);
    await prisma.sellerUser.create({
      data: {
        sellerId: fixture.product.store.sellerId,
        sellerRole: SellerUserRole.OPERATOR,
        userId: seller.userId,
      },
    });
    await Promise.allSettled([
      transitionOrder(seller, {
        newStatus: OrderStatus.CONFIRMED,
        orderId: fixture.order.id,
      }),
      adminCancelOrder(
        admin,
        fixture.order.orderNumber,
        "Concurrent support cancellation",
      ),
    ]);
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: fixture.order.id },
    });
    expect([OrderStatus.CONFIRMED, OrderStatus.CANCELLED]).toContain(
      order.status,
    );
    expect(
      await prisma.orderStatusHistory.count({
        where: { orderId: order.id, newStatus: order.status },
      }),
    ).toBe(1);
  });
});

describe.sequential("admin moderation and finance", () => {
  it("approves, suspends and reactivates sellers; suspended sellers cannot act", async () => {
    const admin = await user(UserRoleCode.ADMIN, operationsPermissions);
    const fixture = await orderFixture();
    const seller = await user(UserRoleCode.SELLER);
    await prisma.sellerUser.create({
      data: {
        sellerId: fixture.product.store.sellerId,
        sellerRole: SellerUserRole.OPERATOR,
        userId: seller.userId,
      },
    });
    await updateAdminSeller(admin, fixture.product.store.sellerId, {
      reason: "Review",
      status: SellerStatus.SUSPENDED,
    });
    await expect(
      transitionOrder(seller, {
        newStatus: OrderStatus.CONFIRMED,
        orderId: fixture.order.id,
      }),
    ).rejects.toMatchObject({ code: "INVALID_ORDER_TRANSITION" });
    await updateAdminSeller(admin, fixture.product.store.sellerId, {
      status: SellerStatus.APPROVED,
    });
    expect(
      (
        await prisma.seller.findUniqueOrThrow({
          where: { id: fixture.product.store.sellerId },
        })
      ).status,
    ).toBe(SellerStatus.APPROVED);
  });

  it("suspends/reactivates customers and moderates products", async () => {
    const admin = await user(UserRoleCode.ADMIN, [
      ...operationsPermissions,
      Permission.ProductsModerate,
    ]);
    const customer = await user(UserRoleCode.CUSTOMER);
    await updateAdminCustomer(admin, customer.userId, UserStatus.SUSPENDED);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: customer.userId } }))
        .status,
    ).toBe(UserStatus.SUSPENDED);
    await updateAdminCustomer(admin, customer.userId, UserStatus.ACTIVE);
    const product = await prisma.product.findFirstOrThrow();
    await moderateProduct(admin, product.id, {
      note: "Moderation",
      status: ProductStatus.HIDDEN,
    });
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: product.id } }))
        .status,
    ).toBe(ProductStatus.HIDDEN);
  });

  it("creates, edits and deactivates categories", async () => {
    const admin = await user(UserRoleCode.ADMIN, [
      Permission.AdminAccess,
      Permission.CategoriesManage,
    ]);
    const slug = `phase5-${randomUUID()}`;
    const category = await createCategory(admin, {
      description: null,
      name: "Phase 5 Category",
      parentId: null,
      slug,
      sortOrder: 90,
    });
    const updated = await updateCategory(admin, category.id, {
      isActive: false,
      name: "Phase 5 Updated",
    });
    expect(updated.isActive).toBe(false);
    expect(updated.name).toBe("Phase 5 Updated");
  });

  it("reports correct finance aggregates and only balanced ledger transactions", async () => {
    const finance = await user(UserRoleCode.ADMIN, [
      Permission.AdminAccess,
      Permission.FinanceRead,
    ]);
    await orderFixture();
    const overview = await getFinanceOverview(finance, {});
    expect(Number(overview.gmv)).toBeGreaterThan(0);
    expect(overview.ledger.length).toBeGreaterThan(0);
    expect(overview.ledger.every((t) => t.balanced)).toBe(true);
  });

  it("does not deactivate a courier with active work", async () => {
    const admin = await user(UserRoleCode.ADMIN, operationsPermissions);
    const ready = await readyOrder();
    const assigned = await courier();
    await assignCourier(admin, ready.order.orderNumber, assigned.id);
    await expect(
      updateCourier(admin, assigned.id, {
        isActive: false,
        status: CourierStatus.SUSPENDED,
        transportType: null,
      }),
    ).rejects.toMatchObject({ code: "COURIER_ASSIGNMENT_CONFLICT" });
  });
});
