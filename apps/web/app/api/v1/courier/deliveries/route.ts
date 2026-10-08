import {
  courierDeliveryFilterSchema,
  listCourierDeliveries,
  listCourierHistory,
} from "@nozi/marketplace";

import { courierApi } from "../../../../../lib/courier-api";

export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return courierApi(request, async ({ actor }) => {
    const filter = courierDeliveryFilterSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return {
      deliveries:
        filter.scope === "HISTORY"
          ? await listCourierHistory(actor, filter)
          : await listCourierDeliveries(actor, filter),
    };
  });
}
