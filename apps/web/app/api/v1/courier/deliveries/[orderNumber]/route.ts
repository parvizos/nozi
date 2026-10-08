import { getCourierDelivery } from "@nozi/marketplace";

import {
  courierApi,
  courierOrderNumberSchema,
} from "../../../../../../lib/courier-api";

export const dynamic = "force-dynamic";
export function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  return courierApi(request, async ({ actor }) => ({
    delivery: await getCourierDelivery(
      actor,
      courierOrderNumberSchema.parse((await params).orderNumber),
    ),
  }));
}
