import { getNotificationSummary } from "@nozi/notifications";
import { z } from "zod";

import { authenticatedApi } from "../../../../lib/authenticated-api";

export function GET(request: Request) {
  return authenticatedApi(request, async ({ actor }) => {
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .default(1)
      .parse(new URL(request.url).searchParams.get("page") ?? undefined);
    return getNotificationSummary(actor, page);
  });
}
