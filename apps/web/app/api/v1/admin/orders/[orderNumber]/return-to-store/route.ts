import { startFailedDeliveryReturn } from "@nozi/marketplace";

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
    async ({ actor, requestId }) => ({
      order: await startFailedDeliveryReturn(
        actor,
        orderNumberSchema.parse((await params).orderNumber),
        requestId,
      ),
    }),
    { mutation: true },
  );
}
