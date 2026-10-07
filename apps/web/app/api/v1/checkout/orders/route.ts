import { requireActorContext } from "@nozi/auth";
import {
  checkoutSchema,
  idempotencyKeySchema,
  placeOrder,
} from "@nozi/marketplace";
import { getRequestContext } from "@nozi/observability";

import { apiError, apiJson } from "../../../../../lib/api-response";
import { assertTrustedOrigin } from "../../../../../lib/api-security";

export async function POST(request: Request) {
  const { logger, requestId } = getRequestContext(request);
  try {
    assertTrustedOrigin(request);
    const actor = await requireActorContext(request.headers);
    const idempotencyKey = idempotencyKeySchema.parse(
      request.headers.get("idempotency-key"),
    );
    const input = checkoutSchema.parse(await request.json());
    const result = await placeOrder(actor, input, {
      idempotencyKey,
      requestId,
    });
    const status = result.created ? 201 : 200;
    logger.info(
      {
        actorUserId: actor.userId,
        orderId: result.orderId,
        reused: !result.created,
        statusCode: status,
      },
      "checkout completed",
    );
    return apiJson({ order: result }, requestId, status);
  } catch (error) {
    return apiError(error, requestId, logger);
  }
}
