import {
  courierCreateSchema,
  createCourier,
  listCouriers,
} from "@nozi/marketplace";
import { adminApi } from "../../../../../lib/admin-api";
export function GET(request: Request) {
  return adminApi(request, async ({ actor }) => ({
    couriers: await listCouriers(actor),
  }));
}
export function POST(request: Request) {
  return adminApi(
    request,
    async ({ actor, requestId }) => ({
      courier: await createCourier(
        actor,
        courierCreateSchema.parse(await request.json()),
        requestId,
      ),
    }),
    { mutation: true, status: 201 },
  );
}
