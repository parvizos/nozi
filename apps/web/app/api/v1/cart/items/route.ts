import { requireActorContext } from "@nozi/auth";
import { addCartItem, addCartItemSchema } from "@nozi/marketplace";
import { getRequestContext } from "@nozi/observability";

import { apiError, apiJson } from "../../../../../lib/api-response";
import { assertTrustedOrigin } from "../../../../../lib/api-security";

export async function POST(request: Request) {
  const { logger, requestId } = getRequestContext(request);
  try {
    assertTrustedOrigin(request);
    const actor = await requireActorContext(request.headers);
    const input = addCartItemSchema.parse(await request.json());
    const cart = await addCartItem(actor, input);
    logger.info(
      { actorUserId: actor.userId, cartId: cart.id, statusCode: 201 },
      "cart item added",
    );
    return apiJson({ cart }, requestId, 201);
  } catch (error) {
    return apiError(error, requestId, logger);
  }
}
