import { setAdminUserStatus } from "@nozi/auth";
import { customerAdminUpdateSchema } from "@nozi/marketplace";

import { adminApi, uuidSchema } from "../../../../../../../lib/admin-api";

export function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  return adminApi(
    request,
    async ({ actor, requestId }) => {
      const input = customerAdminUpdateSchema.parse(await request.json());
      await setAdminUserStatus(actor, {
        reason: input.reason,
        requestId,
        status: input.status,
        targetUserId: uuidSchema.parse((await params).userId),
      });
      return { updated: true };
    },
    { mutation: true },
  );
}
