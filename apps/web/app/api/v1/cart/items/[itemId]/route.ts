import { z } from "zod";

import { requireActorContext } from "@nozi/auth";
import {
  removeCartItem,
  updateCartItem,
  updateCartItemSchema,
} from "@nozi/marketplace";
import { getRequestContext } from "@nozi/observability";

import { apiError, apiJson } from "../../../../../../lib/api-response";
import { assertTrustedOrigin } from "../../../../../../lib/api-security";

const idSchema = z.uuid();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { logger, requestId } = getRequestContext(request);
  try {
    assertTrustedOrigin(request);
    const actor = await requireActorContext(request.headers);
    const itemId = idSchema.parse((await params).itemId);
    const input = updateCartItemSchema.parse(await request.json());
    return apiJson(
      { cart: await updateCartItem(actor, itemId, input) },
      requestId,
    );
  } catch (error) {
    return apiError(error, requestId, logger);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { logger, requestId } = getRequestContext(request);
  try {
    assertTrustedOrigin(request);
    const actor = await requireActorContext(request.headers);
    const itemId = idSchema.parse((await params).itemId);
    return apiJson({ cart: await removeCartItem(actor, itemId) }, requestId);
  } catch (error) {
    return apiError(error, requestId, logger);
  }
}
