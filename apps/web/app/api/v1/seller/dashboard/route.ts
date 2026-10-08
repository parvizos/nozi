import { requireActorContext } from "@nozi/auth";
import { getSellerDashboard } from "@nozi/marketplace";
import { getRequestContext } from "@nozi/observability";
import { apiError, apiJson } from "../../../../../lib/api-response";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const { logger, requestId } = getRequestContext(request);
  try {
    const actor = await requireActorContext(request.headers);
    return apiJson({ dashboard: await getSellerDashboard(actor) }, requestId);
  } catch (error) {
    return apiError(error, requestId, logger);
  }
}
