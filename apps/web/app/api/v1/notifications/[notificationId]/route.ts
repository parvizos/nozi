import { markNotificationRead } from "@nozi/notifications";
import { z } from "zod";

import { authenticatedApi } from "../../../../../lib/authenticated-api";

export function PATCH(
  request: Request,
  { params }: { params: Promise<{ notificationId: string }> },
) {
  return authenticatedApi(
    request,
    async ({ actor }) =>
      markNotificationRead(
        actor,
        z.uuid().parse((await params).notificationId),
      ),
    { mutation: true },
  );
}
