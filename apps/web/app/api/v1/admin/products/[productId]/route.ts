import { moderateProduct, productModerationSchema } from "@nozi/marketplace";
import { adminApi, uuidSchema } from "../../../../../../lib/admin-api";
export function PATCH(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  return adminApi(
    request,
    async ({ actor, requestId }) => ({
      product: await moderateProduct(
        actor,
        uuidSchema.parse((await params).productId),
        productModerationSchema.parse(await request.json()),
        requestId,
      ),
    }),
    { mutation: true },
  );
}
