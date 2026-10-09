import { randomUUID } from "node:crypto";

import { buildActorContext, Permission, type ActorContext } from "@nozi/auth";
import {
  CourierStatus,
  InventoryReservationStatus,
  LedgerDirection,
  OrderStatus,
  OutboxStatus,
  ProductStatus,
  StoreStatus,
  UserRoleCode,
  prisma,
} from "@nozi/database";
import {
  addCartItem,
  assignCourier,
  getDevelopmentDeliveryCode,
  placeOrder,
  sellerTransitionOrder,
  transitionCourierDelivery,
} from "@nozi/marketplace";

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function registerCustomerThroughOtp(): Promise<ActorContext> {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  const phone = `+99293${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
  const request = await fetch(`${baseUrl}/api/v1/auth/otp/request`, {
    body: JSON.stringify({ phone }),
    headers: { "content-type": "application/json", origin: baseUrl },
    method: "POST",
  });
  const requested = (await request.json()) as {
    developmentCode?: string;
  };
  const code = requested.developmentCode;
  if (request.status !== 202 || !code)
    throw new Error("Runtime OTP request did not return the explicit dev code");
  const verify = await fetch(`${baseUrl}/api/auth/phone-number/verify`, {
    body: JSON.stringify({ code, phoneNumber: phone }),
    headers: { "content-type": "application/json", origin: baseUrl },
    method: "POST",
  });
  if (!verify.ok || !verify.headers.get("set-cookie"))
    throw new Error("Runtime OTP verification did not create a session");
  const customer = await prisma.user.findUniqueOrThrow({
    where: { phoneNumber: phone },
  });
  return actorForUser(customer.id);
}

async function actorForUser(userId: string): Promise<ActorContext> {
  const user = await prisma.user.findUniqueOrThrow({
    include: {
      adminPermissions: { include: { permission: true } },
      roles: { include: { role: true } },
    },
    where: { id: userId },
  });
  return buildActorContext({
    explicitPermissions: user.adminPermissions.map(
      ({ permission }) => permission.code,
    ),
    roles: user.roles.map(({ role }) => role.code),
    status: user.status,
    userId,
  });
}

function futureDate(days: number): string {
  const date = new Date(Date.now() + days * 24 * 60 * 60_000);
  return date.toISOString().slice(0, 10);
}

async function createOrder(customer: ActorContext) {
  const product = await prisma.product.findFirstOrThrow({
    include: {
      store: { include: { seller: { include: { users: true } } } },
      variants: {
        orderBy: { sortOrder: "asc" },
        where: { isActive: true, stockQuantity: { gt: 2 } },
      },
    },
    where: {
      status: ProductStatus.ACTIVE,
      stockQuantity: { gt: 2 },
      store: {
        deletedAt: null,
        isActive: true,
        isOpen: true,
        isTemporarilyPaused: false,
        status: StoreStatus.ACTIVE,
        seller: {
          deletedAt: null,
          status: "APPROVED",
          users: { some: { sellerRole: { in: ["OWNER", "MANAGER"] } } },
        },
      },
    },
  });
  const variant = product.variants[0];
  await addCartItem(customer, {
    productId: product.id,
    ...(variant ? { productVariantId: variant.id } : {}),
    quantity: 1,
  });
  const placed = await placeOrder(
    customer,
    {
      anonymousDelivery: false,
      apartment: "12",
      buyerName: "Pilot Customer",
      buyerPhone: "+992900009991",
      customerNote: undefined,
      deliveryAddress: "проспект Рудаки, 120",
      deliveryDate: futureDate(2),
      deliveryNote: "Позвонить за пять минут",
      deliveryWindowEnd: "18:00",
      deliveryWindowStart: "16:00",
      entrance: "2",
      floor: "4",
      giftMessage: "С праздником!",
      paymentMethod: "CASH",
      recipientName: "Pilot Recipient",
      recipientPhone: "+992900009992",
    },
    {
      idempotencyKey: `runtime-${randomUUID()}`,
      requestId: `runtime-${randomUUID()}`,
    },
  );
  return { placed, product };
}

async function main() {
  const customer = await registerCustomerThroughOtp();
  const { placed, product } = await createOrder(customer);
  const sellerMembership = product.store.seller.users.find(
    ({ sellerRole }) => sellerRole === "OWNER" || sellerRole === "MANAGER",
  );
  if (!sellerMembership) throw new Error("Seller manager fixture missing");
  const seller = await actorForUser(sellerMembership.userId);
  await sellerTransitionOrder(seller, placed.orderNumber, {
    newStatus: OrderStatus.CONFIRMED,
  });
  await sellerTransitionOrder(seller, placed.orderNumber, {
    newStatus: OrderStatus.PREPARING,
  });
  await sellerTransitionOrder(seller, placed.orderNumber, {
    newStatus: OrderStatus.READY_FOR_PICKUP,
  });

  const superAdmin = await prisma.user.findFirstOrThrow({
    where: {
      roles: { some: { role: { code: UserRoleCode.SUPER_ADMIN } } },
    },
  });
  const admin = await actorForUser(superAdmin.id);
  if (!admin.permissions.has(Permission.OrdersManage))
    throw new Error("Super admin permissions missing");
  const courier = await prisma.courier.findFirstOrThrow({
    where: {
      isActive: true,
      status: CourierStatus.AVAILABLE,
      user: { status: "ACTIVE" },
    },
  });
  const courierActor = await actorForUser(courier.userId);
  await assignCourier(
    admin,
    placed.orderNumber,
    courier.id,
    `runtime-${randomUUID()}`,
  );
  await transitionCourierDelivery(courierActor, placed.orderNumber, "ACCEPT");
  await transitionCourierDelivery(courierActor, placed.orderNumber, "ARRIVE");
  await transitionCourierDelivery(courierActor, placed.orderNumber, "PICKUP");
  await transitionCourierDelivery(courierActor, placed.orderNumber, "START");
  const { code } = await getDevelopmentDeliveryCode(admin, placed.orderNumber);
  await transitionCourierDelivery(
    courierActor,
    placed.orderNumber,
    "DELIVER",
    `runtime-${randomUUID()}`,
    { deliveryCode: code },
  );

  await delay(2_500);
  const order = await prisma.order.findUniqueOrThrow({
    include: {
      inventoryReservations: true,
      payment: true,
    },
    where: { id: placed.orderId },
  });
  const assignment = await prisma.courierAssignment.findFirstOrThrow({
    orderBy: { assignedAt: "desc" },
    where: { orderId: order.id },
  });
  const refreshedCourier = await prisma.courier.findUniqueOrThrow({
    where: { id: courier.id },
  });
  const transactions = await prisma.ledgerTransaction.findMany({
    include: { entries: true },
    where: { referenceId: order.id },
  });
  const balanced = transactions.every((transaction) => {
    const debit = transaction.entries
      .filter((entry) => entry.direction === LedgerDirection.DEBIT)
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const credit = transaction.entries
      .filter((entry) => entry.direction === LedgerDirection.CREDIT)
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    return Math.abs(debit - credit) < 0.001;
  });
  const customerNotifications = await prisma.notification.count({
    where: { userId: customer.userId },
  });
  const sellerNotifications = await prisma.notification.count({
    where: { userId: seller.userId, type: "NEW_ORDER_SELLER" },
  });
  const courierNotifications = await prisma.notification.count({
    where: { userId: courier.userId, type: "DELIVERY_ASSIGNED" },
  });

  if (
    order.status !== OrderStatus.DELIVERED ||
    order.payment?.status !== "PAID" ||
    assignment.status !== "DELIVERED" ||
    refreshedCourier.status !== CourierStatus.AVAILABLE ||
    order.inventoryReservations.some(
      ({ status }) => status !== InventoryReservationStatus.CONSUMED,
    ) ||
    !balanced ||
    customerNotifications < 1 ||
    sellerNotifications < 1 ||
    courierNotifications < 1
  )
    throw new Error("Normal delivery acceptance invariant failed");

  const stale = await createOrder(customer);
  await prisma.inventoryReservation.updateMany({
    data: { expiresAt: new Date(Date.now() - 60_000) },
    where: { orderId: stale.placed.orderId },
  });
  await delay(12_000);
  const expired = await prisma.order.findUniqueOrThrow({
    where: { id: stale.placed.orderId },
  });
  if (expired.status !== OrderStatus.CANCELLED)
    throw new Error("Stale order scheduler did not cancel the order");

  const poison = await prisma.outboxEvent.create({
    data: {
      aggregateId: randomUUID(),
      aggregateType: "RuntimeAcceptance",
      dedupeKey: `runtime-poison:${randomUUID()}`,
      maxAttempts: 1,
      payload: {},
      type: "UNSUPPORTED_RUNTIME_EVENT",
    },
  });
  await delay(2_000);
  const dead = await prisma.outboxEvent.findUniqueOrThrow({
    where: { id: poison.id },
  });
  if (dead.status !== OutboxStatus.DEAD_LETTER)
    throw new Error("Poison event did not reach dead letter");

  process.stdout.write(
    `${JSON.stringify({
      assignment: assignment.status,
      courier: refreshedCourier.status,
      courierNotifications,
      customerNotifications,
      deadLetter: dead.status,
      ledgerBalanced: balanced,
      order: order.status,
      payment: order.payment?.status,
      sellerNotifications,
      staleOrder: expired.status,
    })}\n`,
  );
}

void main()
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
