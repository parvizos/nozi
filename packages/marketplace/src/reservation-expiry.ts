import {
  InventoryReservationStatus,
  OrderStatus,
  OrderStatusSource,
  Prisma,
  prisma,
} from "@nozi/database";

import { MarketplaceError } from "./errors";
import {
  systemTransitionPrincipal,
  transitionOrderInTransaction,
} from "./order-state-machine";

export async function expireStaleOrders(now = new Date()): Promise<{
  expiredOrderIds: string[];
}> {
  const candidates = await prisma.order.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true },
    take: 100,
    where: {
      inventoryReservations: {
        some: {
          expiresAt: { lte: now },
          status: InventoryReservationStatus.ACTIVE,
        },
      },
      status: OrderStatus.AWAITING_SELLER_CONFIRMATION,
    },
  });
  const expiredOrderIds: string[] = [];
  for (const candidate of candidates) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const order = await tx.order.findUniqueOrThrow({
            select: { status: true, version: true },
            where: { id: candidate.id },
          });
          if (order.status !== OrderStatus.AWAITING_SELLER_CONFIRMATION) return;
          const expired = await tx.inventoryReservation.count({
            where: {
              expiresAt: { lte: now },
              orderId: candidate.id,
              status: InventoryReservationStatus.ACTIVE,
            },
          });
          if (expired === 0) return;
          await transitionOrderInTransaction(tx, systemTransitionPrincipal, {
            cancellationReasonCode: "SELLER_CONFIRMATION_TIMEOUT",
            expectedVersion: order.version,
            newStatus: OrderStatus.CANCELLED,
            note: "Seller confirmation SLA expired",
            orderId: candidate.id,
            source: OrderStatusSource.SYSTEM,
          });
          expiredOrderIds.push(candidate.id);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof MarketplaceError &&
        error.code === "INVALID_ORDER_TRANSITION"
      )
        continue;
      throw error;
    }
  }
  return { expiredOrderIds };
}
