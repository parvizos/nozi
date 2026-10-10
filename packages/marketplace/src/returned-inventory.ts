import { assertPermission, Permission, type ActorContext } from "@nozi/auth";
import {
  InventoryReservationStatus,
  OrderStatus,
  ReturnedInventoryDecision,
  UserRoleCode,
  Prisma,
  prisma,
} from "@nozi/database";
import { z } from "zod";

import { MarketplaceError } from "./errors";
import { assertSellerStoreAccess, SellerPermission } from "./seller-access";

export const returnedInventoryDecisionSchema = z.object({
  decision: z.enum(ReturnedInventoryDecision),
  reason: z.string().trim().min(3).max(500),
});

export async function decideReturnedInventory(
  actor: ActorContext,
  orderNumber: string,
  input: z.infer<typeof returnedInventoryDecisionSchema>,
  requestId?: string,
) {
  const order = await prisma.order.findUnique({
    select: { id: true, status: true, storeId: true },
    where: { orderNumber },
  });
  if (!order)
    throw new MarketplaceError("ORDER_NOT_FOUND", "Заказ не найден", 404);
  if (
    actor.roles.has(UserRoleCode.ADMIN) ||
    actor.roles.has(UserRoleCode.SUPER_ADMIN)
  ) {
    assertPermission(actor, Permission.OrdersManage);
  } else {
    await assertSellerStoreAccess(
      actor,
      order.storeId,
      SellerPermission.ManageProducts,
    );
  }
  if (order.status !== OrderStatus.RETURNED_TO_STORE)
    throw new MarketplaceError(
      "INVENTORY_RESERVATION_CONFLICT",
      "Решение доступно только после подтверждённого возврата",
      409,
    );

  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.returnedInventoryDisposition.findMany({
        include: { reservation: true },
        where: { orderId: order.id },
      });
      if (!rows.length)
        throw new MarketplaceError(
          "INVENTORY_RESERVATION_CONFLICT",
          "Позиции возврата не найдены",
          409,
        );
      const pending = rows.filter(({ decision }) => decision === null);
      if (!pending.length) {
        if (rows.every(({ decision }) => decision === input.decision))
          return { decision: input.decision, idempotent: true };
        throw new MarketplaceError(
          "INVENTORY_RESERVATION_CONFLICT",
          "Решение по возврату уже принято",
          409,
        );
      }
      for (const row of pending) {
        const reservation = row.reservation;
        const consume = input.decision === ReturnedInventoryDecision.WRITE_OFF;
        const product = await tx.product.updateMany({
          data: {
            reservedQuantity: { decrement: reservation.quantity },
            ...(consume
              ? { stockQuantity: { decrement: reservation.quantity } }
              : {}),
          },
          where: {
            id: reservation.productId,
            reservedQuantity: { gte: reservation.quantity },
            ...(consume
              ? { stockQuantity: { gte: reservation.quantity } }
              : {}),
          },
        });
        if (product.count !== 1)
          throw new MarketplaceError(
            "INVENTORY_RESERVATION_CONFLICT",
            "Состояние резерва товара изменилось",
            409,
          );
        if (reservation.productVariantId) {
          const variant = await tx.productVariant.updateMany({
            data: {
              reservedQuantity: { decrement: reservation.quantity },
              ...(consume
                ? { stockQuantity: { decrement: reservation.quantity } }
                : {}),
            },
            where: {
              id: reservation.productVariantId,
              reservedQuantity: { gte: reservation.quantity },
              ...(consume
                ? { stockQuantity: { gte: reservation.quantity } }
                : {}),
            },
          });
          if (variant.count !== 1)
            throw new MarketplaceError(
              "INVENTORY_RESERVATION_CONFLICT",
              "Состояние резерва варианта изменилось",
              409,
            );
        }
        const reservationUpdated = await tx.inventoryReservation.updateMany({
          data: {
            status: consume
              ? InventoryReservationStatus.CONSUMED
              : InventoryReservationStatus.RELEASED,
          },
          where: {
            id: reservation.id,
            status: InventoryReservationStatus.ACTIVE,
          },
        });
        if (reservationUpdated.count !== 1)
          throw new MarketplaceError(
            "INVENTORY_RESERVATION_CONFLICT",
            "Решение по позиции уже принято",
            409,
          );
        await tx.returnedInventoryDisposition.update({
          data: {
            decidedAt: new Date(),
            decidedByUserId: actor.userId,
            decision: input.decision,
            reason: input.reason,
          },
          where: { id: row.id },
        });
      }
      await tx.auditLog.create({
        data: {
          action: "inventory.return_disposition_decided",
          actorRole: [...actor.roles].sort().join(","),
          actorUserId: actor.userId,
          afterRedacted: {
            decision: input.decision,
            itemCount: pending.length,
          },
          beforeRedacted: { decision: null },
          reason: input.reason,
          requestId: requestId ?? null,
          subjectId: order.id,
          subjectType: "Order",
        },
      });
      return { decision: input.decision, idempotent: false };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
