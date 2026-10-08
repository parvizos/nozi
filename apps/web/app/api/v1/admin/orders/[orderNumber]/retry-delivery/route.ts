import {
  failedDeliveryRetrySchema,
  retryFailedDelivery,
} from "@nozi/marketplace";

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
      assignment: await retryFailedDelivery(
        actor,
        orderNumberSchema.parse((await params).orderNumber),
        failedDeliveryRetrySchema.parse(await request.json()),
        requestId,
      ),
    }),
    { mutation: true },
  );
}
