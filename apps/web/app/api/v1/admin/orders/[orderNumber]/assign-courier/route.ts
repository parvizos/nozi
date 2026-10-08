import { assignCourier, courierAssignmentSchema } from "@nozi/marketplace";
import {
  adminApi,
  orderNumberSchema,
} from "../../../../../../../lib/admin-api";
export function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  return adminApi(
    request,
    async ({ actor, requestId }) => {
      const input = courierAssignmentSchema.parse(await request.json());
      return {
        assignment: await assignCourier(
          actor,
          orderNumberSchema.parse((await params).orderNumber),
          input.courierId,
          requestId,
        ),
      };
    },
    { mutation: true, status: 201 },
  );
}
