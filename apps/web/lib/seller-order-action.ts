import type { OrderStatus } from "@nozi/database";
import { requireActorContext } from "@nozi/auth";
import {
  sellerOrderActionSchema,
  sellerTransitionOrder,
} from "@nozi/marketplace";
import { getRequestContext } from "@nozi/observability";
import { z } from "zod";
import { apiError, apiJson } from "./api-response";
import { assertTrustedOrigin } from "./api-security";

const orderNumberSchema = z.string().min(5).max(32);
export async function handleSellerOrderAction(
  request: Request,
  params: Promise<{ orderNumber: string }>,
  newStatus: OrderStatus,
) {
  const { logger, requestId } = getRequestContext(request);
  try {
    assertTrustedOrigin(request);
    const actor = await requireActorContext(request.headers);
    const input = sellerOrderActionSchema.parse(await request.json());
    const orderNumber = orderNumberSchema.parse((await params).orderNumber);
    const order = await sellerTransitionOrder(actor, orderNumber, {
      ...input,
      newStatus,
      requestId,
    });
    logger.info(
      { actorUserId: actor.userId, orderId: order.id, status: newStatus },
      "seller order transitioned",
    );
    return apiJson(
      {
        order: {
          orderNumber: order.orderNumber,
          status: order.status,
          version: order.version,
        },
      },
      requestId,
    );
  } catch (error) {
    return apiError(error, requestId, logger);
  }
}
