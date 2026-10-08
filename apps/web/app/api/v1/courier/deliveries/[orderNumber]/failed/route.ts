import {
  courierFailureSchema,
  reportCourierDeliveryFailure,
} from "@nozi/marketplace";

import {
  courierApi,
  courierOrderNumberSchema,
} from "../../../../../../../lib/courier-api";

export function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  return courierApi(
    request,
    async ({ actor, requestId }) => ({
      failure: await reportCourierDeliveryFailure(
        actor,
        courierOrderNumberSchema.parse((await params).orderNumber),
        courierFailureSchema.parse(await request.json()),
        requestId,
      ),
    }),
    { mutation: true, status: 201 },
  );
}
