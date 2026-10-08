import { requireActorContext } from "@nozi/auth";
import { getRequestContext, REQUEST_ID_HEADER } from "@nozi/observability";

import { apiError, apiJson } from "./api-response";
import { assertTrustedOrigin } from "./api-security";

export async function authenticatedApi(
  request: Request,
  handler: (context: {
    actor: Awaited<ReturnType<typeof requireActorContext>>;
    requestId: string;
  }) => Promise<Response | unknown>,
  options: { mutation?: boolean; status?: number } = {},
) {
  const { logger, requestId } = getRequestContext(request);
  try {
    if (options.mutation) assertTrustedOrigin(request);
    const actor = await requireActorContext(request.headers);
    const result = await handler({ actor, requestId });
    if (result instanceof Response) {
      result.headers.set(REQUEST_ID_HEADER, requestId);
      return result;
    }
    logger.info(
      { actorUserId: actor.userId, statusCode: options.status ?? 200 },
      "authenticated API request completed",
    );
    return apiJson(result, requestId, options.status ?? 200);
  } catch (error) {
    return apiError(error, requestId, logger);
  }
}
