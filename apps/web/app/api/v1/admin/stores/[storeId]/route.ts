import {
  getAdminStore,
  storeAdminUpdateSchema,
  updateAdminStore,
} from "@nozi/marketplace";
import { adminApi, uuidSchema } from "../../../../../../lib/admin-api";
export function GET(
  request: Request,
  { params }: { params: Promise<{ storeId: string }> },
) {
  return adminApi(request, async ({ actor }) => ({
    store: await getAdminStore(actor, uuidSchema.parse((await params).storeId)),
  }));
}
export function PATCH(
  request: Request,
  { params }: { params: Promise<{ storeId: string }> },
) {
  return adminApi(
    request,
    async ({ actor, requestId }) => ({
      store: await updateAdminStore(
        actor,
        uuidSchema.parse((await params).storeId),
        storeAdminUpdateSchema.parse(await request.json()),
        requestId,
      ),
    }),
    { mutation: true },
  );
}
