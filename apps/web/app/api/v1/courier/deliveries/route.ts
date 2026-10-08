import {
  courierDeliveryFilterSchema,
  listCourierDeliveries,
} from "@nozi/marketplace";

import { courierApi } from "../../../../../lib/courier-api";

export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return courierApi(request, async ({ actor }) => ({
    deliveries: await listCourierDeliveries(
      actor,
      courierDeliveryFilterSchema.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    ),
  }));
}
