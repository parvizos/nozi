import { requireActorContext } from "@nozi/auth";
import {
  getSellerStore,
  sellerStoreUpdateSchema,
  updateSellerStore,
} from "@nozi/marketplace";
import { getRequestContext } from "@nozi/observability";
import { z } from "zod";
import { apiError, apiJson } from "../../../../../../lib/api-response";
import { assertTrustedOrigin } from "../../../../../../lib/api-security";

const idSchema = z.uuid();
export async function GET(
  request: Request,
  { params }: { params: Promise<{ storeId: string }> },
) {
  const { logger, requestId } = getRequestContext(request);
  try {
    const actor = await requireActorContext(request.headers);
    return apiJson(
      {
        store: await getSellerStore(
          actor,
          idSchema.parse((await params).storeId),
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
  { params }: { params: Promise<{ storeId: string }> },
) {
  const { logger, requestId } = getRequestContext(request);
  try {
    assertTrustedOrigin(request);
    const actor = await requireActorContext(request.headers);
    const id = idSchema.parse((await params).storeId);
    const store = await updateSellerStore(
      actor,
      id,
      sellerStoreUpdateSchema.parse(await request.json()),
      requestId,
    );
    return apiJson(
      { store: { id: store.id, updatedAt: store.updatedAt.toISOString() } },
      requestId,
    );
  } catch (error) {
    return apiError(error, requestId, logger);
  }
}
