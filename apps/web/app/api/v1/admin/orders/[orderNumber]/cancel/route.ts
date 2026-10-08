import { adminCancelOrder, adminCancelSchema } from "@nozi/marketplace";
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
      const input = adminCancelSchema.parse(await request.json());
      const order = await adminCancelOrder(
        actor,
        orderNumberSchema.parse((await params).orderNumber),
        input.reason,
        requestId,
      );
      return {
        order: { orderNumber: order.orderNumber, status: order.status },
      };
    },
    { mutation: true },
  );
}
