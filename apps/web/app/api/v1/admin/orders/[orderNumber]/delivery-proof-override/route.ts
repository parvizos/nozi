import { overrideDeliveryProof } from "@nozi/marketplace";
import { z } from "zod";

import {
  adminApi,
  orderNumberSchema,
} from "../../../../../../../lib/admin-api";

const schema = z.object({ reason: z.string().trim().min(3).max(500) });

export function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  return adminApi(
    request,
    async ({ actor, requestId }) => {
      const input = schema.parse(await request.json());
      await overrideDeliveryProof(
        actor,
        orderNumberSchema.parse((await params).orderNumber),
        input.reason,
        requestId,
      );
      return { overridden: true };
    },
    { mutation: true },
  );
}
