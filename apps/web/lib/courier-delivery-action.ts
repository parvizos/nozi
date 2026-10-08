import {
  transitionCourierDelivery,
  type CourierDeliveryAction,
} from "@nozi/marketplace";

import { courierApi, courierOrderNumberSchema } from "./courier-api";

export function handleCourierDeliveryAction(
  request: Request,
  params: Promise<{ orderNumber: string }>,
  action: CourierDeliveryAction,
) {
  return courierApi(
    request,
    async ({ actor, requestId }) => {
      const orderNumber = courierOrderNumberSchema.parse(
        (await params).orderNumber,
      );
      return {
        delivery: await transitionCourierDelivery(
          actor,
          orderNumber,
          action,
          requestId,
        ),
      };
    },
    { mutation: true },
  );
}
