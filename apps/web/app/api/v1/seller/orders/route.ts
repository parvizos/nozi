import { requireActorContext } from "@nozi/auth";
import { listSellerOrders, sellerOrderFilterSchema } from "@nozi/marketplace";
import { getRequestContext } from "@nozi/observability";
import { apiError, apiJson } from "../../../../../lib/api-response";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const { logger, requestId } = getRequestContext(request);
  try {
    const actor = await requireActorContext(request.headers);
    const url = new URL(request.url);
    const filter = sellerOrderFilterSchema.parse(
      Object.fromEntries(url.searchParams),
    );
    return apiJson(
      { orders: await listSellerOrders(actor, filter) },
      requestId,
    );
  } catch (error) {
    return apiError(error, requestId, logger);
  }
}
