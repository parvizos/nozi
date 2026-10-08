import { requireActorContext } from "@nozi/auth";
import { getRequestContext } from "@nozi/observability";
import { z } from "zod";

import { apiError, apiJson } from "./api-response";
import { assertTrustedOrigin } from "./api-security";

export const courierOrderNumberSchema = z.string().min(5).max(32);

export async function courierApi(
  request: Request,
  handler: (context: {
    actor: Awaited<ReturnType<typeof requireActorContext>>;
    requestId: string;
  }) => Promise<unknown>,
  options: { mutation?: boolean; status?: number } = {},
) {
  const { logger, requestId } = getRequestContext(request);
  try {
    if (options.mutation) assertTrustedOrigin(request);
    const actor = await requireActorContext(request.headers);
    return apiJson(
      await handler({ actor, requestId }),
      requestId,
      options.status ?? 200,
    );
  } catch (error) {
    return apiError(error, requestId, logger);
  }
}
