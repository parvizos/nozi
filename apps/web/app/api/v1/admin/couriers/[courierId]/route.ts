import { courierUpdateSchema, updateCourier } from "@nozi/marketplace";
import { adminApi, uuidSchema } from "../../../../../../lib/admin-api";
export function PATCH(
  request: Request,
  { params }: { params: Promise<{ courierId: string }> },
) {
  return adminApi(
    request,
    async ({ actor, requestId }) => ({
      courier: await updateCourier(
        actor,
        uuidSchema.parse((await params).courierId),
        courierUpdateSchema.parse(await request.json()),
        requestId,
      ),
    }),
    { mutation: true },
  );
}
