import {
  customerAdminUpdateSchema,
  getAdminCustomer,
  updateAdminCustomer,
} from "@nozi/marketplace";
import { adminApi, uuidSchema } from "../../../../../../lib/admin-api";
export function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  return adminApi(request, async ({ actor }) => ({
    customer: await getAdminCustomer(
      actor,
      uuidSchema.parse((await params).userId),
    ),
  }));
}
export function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  return adminApi(
    request,
    async ({ actor, requestId }) => {
      const input = customerAdminUpdateSchema.parse(await request.json());
      return {
        customer: await updateAdminCustomer(
          actor,
          uuidSchema.parse((await params).userId),
          input.status,
          requestId,
        ),
      };
    },
    { mutation: true },
  );
}
