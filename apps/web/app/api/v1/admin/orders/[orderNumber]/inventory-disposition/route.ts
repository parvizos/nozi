import {
  decideReturnedInventory,
  returnedInventoryDecisionSchema,
} from "@nozi/marketplace";

import {
  adminApi,
  orderNumberSchema,
} from "../../../../../../../lib/admin-api";

export function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  return adminApi(
    request,
    async ({ actor, requestId }) => ({
      disposition: await decideReturnedInventory(
        actor,
        orderNumberSchema.parse((await params).orderNumber),
        returnedInventoryDecisionSchema.parse(await request.json()),
        requestId,
      ),
    }),
    { mutation: true },
  );
}
