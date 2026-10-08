import { transitionCourierDelivery } from "@nozi/marketplace";
import { z } from "zod";

import {
  courierApi,
  courierOrderNumberSchema,
} from "../../../../../../../lib/courier-api";

const schema = z.object({
  deliveryCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});

export function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  return courierApi(
    request,
    async ({ actor, requestId }) => {
      const input = schema.parse(await request.json());
      return {
        delivery: await transitionCourierDelivery(
          actor,
          courierOrderNumberSchema.parse((await params).orderNumber),
          "DELIVER",
          requestId,
          input.deliveryCode ? { deliveryCode: input.deliveryCode } : {},
        ),
      };
    },
    { mutation: true },
  );
}
