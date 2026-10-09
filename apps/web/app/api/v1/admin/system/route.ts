import { getNotificationSystemHealth } from "@nozi/notifications";

import { adminApi } from "../../../../../lib/admin-api";

export function GET(request: Request) {
  return adminApi(request, ({ actor }) => getNotificationSystemHealth(actor));
}
