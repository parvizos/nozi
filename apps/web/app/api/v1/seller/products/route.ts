import { requireActorContext } from "@nozi/auth";
import {
  createSellerProduct,
  listSellerProducts,
  sellerProductFilterSchema,
  sellerProductInputSchema,
} from "@nozi/marketplace";
import { getRequestContext } from "@nozi/observability";
import { apiError, apiJson } from "../../../../../lib/api-response";
import { assertTrustedOrigin } from "../../../../../lib/api-security";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const { logger, requestId } = getRequestContext(request);
  try {
    const actor = await requireActorContext(request.headers);
    const filter = sellerProductFilterSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return apiJson(
      { products: await listSellerProducts(actor, filter) },
      requestId,
    );
  } catch (error) {
    return apiError(error, requestId, logger);
  }
}
export async function POST(request: Request) {
  const { logger, requestId } = getRequestContext(request);
  try {
    assertTrustedOrigin(request);
    const actor = await requireActorContext(request.headers);
    const product = await createSellerProduct(
      actor,
      sellerProductInputSchema.parse(await request.json()),
      requestId,
    );
    return apiJson({ product: { id: product.id } }, requestId, 201);
  } catch (error) {
    return apiError(error, requestId, logger);
  }
}
