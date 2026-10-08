import { getAdminDashboard } from "@nozi/marketplace";
import { adminApi } from "../../../../../lib/admin-api";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return adminApi(request, async ({ actor }) => ({
    dashboard: await getAdminDashboard(actor),
  }));
}
