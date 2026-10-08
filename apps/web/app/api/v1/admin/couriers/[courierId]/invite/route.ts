import { resendCourierInvitation } from "@nozi/marketplace";
import { z } from "zod";

import { adminApi } from "../../../../../../../lib/admin-api";

const idSchema = z.uuid();

export function POST(
  request: Request,
  { params }: { params: Promise<{ courierId: string }> },
) {
  return adminApi(
    request,
    async ({ actor, requestId }) => {
      const courierId = idSchema.parse((await params).courierId);
      const invitation = await resendCourierInvitation(
        actor,
        courierId,
        requestId,
      );
      return {
        expiresAt: invitation.expiresAt,
        activationUrl:
          process.env.NODE_ENV === "production"
            ? null
            : `${process.env.APP_URL}/activate/courier/${invitation.token}`,
      };
    },
    { mutation: true },
  );
}
