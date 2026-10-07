import { z } from "zod";
import { AuthorizationError, requireActorContext } from "@nozi/auth";
import {
  addFavorite,
  ProductUnavailableError,
  removeFavorite,
} from "@nozi/marketplace";

const idSchema = z.uuid();
function errorResponse(error: unknown): Response {
  if (error instanceof AuthorizationError)
    return Response.json(
      { code: error.code, message: error.message },
      { status: error.status },
    );
  if (error instanceof ProductUnavailableError)
    return Response.json(
      { code: "PRODUCT_UNAVAILABLE", message: error.message },
      { status: 404 },
    );
  return Response.json(
    { code: "INTERNAL_ERROR", message: "Unable to update favorite" },
    { status: 500 },
  );
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  try {
    const actor = await requireActorContext(request.headers);
    const productId = idSchema.parse((await params).productId);
    await addFavorite(actor, productId);
    return Response.json({ favorite: true });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { code: "INVALID_PRODUCT_ID", message: "Invalid product id" },
        { status: 400 },
      );
    return errorResponse(error);
  }
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  try {
    const actor = await requireActorContext(request.headers);
    const productId = idSchema.parse((await params).productId);
    await removeFavorite(actor, productId);
    return Response.json({ favorite: false });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { code: "INVALID_PRODUCT_ID", message: "Invalid product id" },
        { status: 400 },
      );
    return errorResponse(error);
  }
}
