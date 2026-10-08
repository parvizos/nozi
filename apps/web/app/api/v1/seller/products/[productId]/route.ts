import { requireActorContext } from "@nozi/auth";
import {
  archiveSellerProduct,
  getSellerProduct,
  sellerProductInputSchema,
  updateSellerProduct,
} from "@nozi/marketplace";
import { getRequestContext } from "@nozi/observability";
import { z } from "zod";
import { apiError, apiJson } from "../../../../../../lib/api-response";
import { assertTrustedOrigin } from "../../../../../../lib/api-security";

const idSchema = z.uuid();
export async function GET(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { logger, requestId } = getRequestContext(request);
  try {
    const actor = await requireActorContext(request.headers);
    return apiJson(
      {
        product: await getSellerProduct(
          actor,
          idSchema.parse((await params).productId),
        ),
      },
      requestId,
    );
  } catch (error) {
    return apiError(error, requestId, logger);
  }
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { logger, requestId } = getRequestContext(request);
  try {
    assertTrustedOrigin(request);
    const actor = await requireActorContext(request.headers);
    const id = idSchema.parse((await params).productId);
    const product = await updateSellerProduct(
      actor,
      id,
      sellerProductInputSchema.parse(await request.json()),
      requestId,
    );
    return apiJson(
      { product: { id: product.id, version: product.version } },
      requestId,
    );
  } catch (error) {
    return apiError(error, requestId, logger);
  }
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { logger, requestId } = getRequestContext(request);
  try {
    assertTrustedOrigin(request);
    const actor = await requireActorContext(request.headers);
    await archiveSellerProduct(
      actor,
      idSchema.parse((await params).productId),
      requestId,
    );
    return apiJson({ archived: true }, requestId);
  } catch (error) {
    return apiError(error, requestId, logger);
  }
}
