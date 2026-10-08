import { getCourierDashboard } from "@nozi/marketplace";

import { courierApi } from "../../../../../lib/courier-api";

export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return courierApi(request, async ({ actor }) => ({
    dashboard: await getCourierDashboard(actor),
  }));
}
