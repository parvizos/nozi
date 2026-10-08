import { requireActorContext } from "@nozi/auth";
import { OrderStatus } from "@nozi/database";
import {
  rejectionReasonSchema,
  sellerTransitionOrder,
} from "@nozi/marketplace";
import { getRequestContext } from "@nozi/observability";
import { z } from "zod";
import { apiError, apiJson } from "../../../../../../../lib/api-response";
import { assertTrustedOrigin } from "../../../../../../../lib/api-security";

const orderNumberSchema = z.string().min(5).max(32);
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  const { logger, requestId } = getRequestContext(request);
  try {
    assertTrustedOrigin(request);
    const actor = await requireActorContext(request.headers);
    const input = rejectionReasonSchema.parse(await request.json());
    const orderNumber = orderNumberSchema.parse((await params).orderNumber);
    const order = await sellerTransitionOrder(actor, orderNumber, {
      newStatus: OrderStatus.CANCELLED,
      note: input.note,
      reason: input.reason,
      requestId,
    });
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
