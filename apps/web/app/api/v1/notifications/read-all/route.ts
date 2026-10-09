import { markAllNotificationsRead } from "@nozi/notifications";

import { authenticatedApi } from "../../../../../lib/authenticated-api";

export function POST(request: Request) {
  return authenticatedApi(
    request,
    ({ actor }) => markAllNotificationsRead(actor),
    { mutation: true },
  );
}
