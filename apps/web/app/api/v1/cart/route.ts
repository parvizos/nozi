import { requireActorContext } from "@nozi/auth";
import { clearCart, getCart } from "@nozi/marketplace";
import { getRequestContext } from "@nozi/observability";

import { apiError, apiJson } from "../../../../lib/api-response";
import { assertTrustedOrigin } from "../../../../lib/api-security";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const { logger, requestId } = getRequestContext(request);
  try {
    assertTrustedOrigin(request);
    const actor = await requireActorContext(request.headers);
    return apiJson({ cart: await getCart(actor) }, requestId);
  } catch (error) {
    return apiError(error, requestId, logger);
  }
}

export async function DELETE(request: Request) {
  const { logger, requestId } = getRequestContext(request);
  try {
    const actor = await requireActorContext(request.headers);
    await clearCart(actor);
    logger.info({ actorUserId: actor.userId, statusCode: 204 }, "cart cleared");
    const response = new Response(null, { status: 204 });
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (error) {
    return apiError(error, requestId, logger);
  }
}
