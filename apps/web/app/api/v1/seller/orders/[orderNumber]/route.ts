import { z } from "zod";
import { requireActorContext } from "@nozi/auth";
import { getSellerOrder } from "@nozi/marketplace";
import { getRequestContext } from "@nozi/observability";
import { apiError, apiJson } from "../../../../../../lib/api-response";

const orderNumberSchema = z.string().min(5).max(32);
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  const { logger, requestId } = getRequestContext(request);
  try {
    const actor = await requireActorContext(request.headers);
    const orderNumber = orderNumberSchema.parse((await params).orderNumber);
    return apiJson(
      { order: await getSellerOrder(actor, orderNumber) },
      requestId,
    );
  } catch (error) {
    return apiError(error, requestId, logger);
  }
}
