import { getDevelopmentDeliveryCode } from "@nozi/marketplace";

import {
  adminApi,
  orderNumberSchema,
} from "../../../../../../../lib/admin-api";

export function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  return adminApi(request, async ({ actor }) =>
    getDevelopmentDeliveryCode(
      actor,
      orderNumberSchema.parse((await params).orderNumber),
    ),
  );
}
