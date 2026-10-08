import {
  getAdminSeller,
  sellerAdminUpdateSchema,
  updateAdminSeller,
} from "@nozi/marketplace";
import { adminApi, uuidSchema } from "../../../../../../lib/admin-api";
export function GET(
  request: Request,
  { params }: { params: Promise<{ sellerId: string }> },
) {
  return adminApi(request, async ({ actor }) => ({
    seller: await getAdminSeller(
      actor,
      uuidSchema.parse((await params).sellerId),
    ),
  }));
}
export function PATCH(
  request: Request,
  { params }: { params: Promise<{ sellerId: string }> },
) {
  return adminApi(
    request,
    async ({ actor, requestId }) => ({
      seller: await updateAdminSeller(
        actor,
        uuidSchema.parse((await params).sellerId),
        sellerAdminUpdateSchema.parse(await request.json()),
        requestId,
      ),
    }),
    { mutation: true },
  );
}
