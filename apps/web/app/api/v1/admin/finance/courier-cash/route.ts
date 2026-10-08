import {
  cashSettlementSchema,
  getCourierCashBalances,
  recordCourierCashSettlement,
} from "@nozi/marketplace";

import { adminApi } from "../../../../../../lib/admin-api";

export function GET(request: Request) {
  return adminApi(request, async ({ actor }) => ({
    balances: await getCourierCashBalances(actor),
  }));
}

export function POST(request: Request) {
  return adminApi(
    request,
    async ({ actor, requestId }) => ({
      settlement: await recordCourierCashSettlement(
        actor,
        cashSettlementSchema.parse(await request.json()),
        requestId,
      ),
    }),
    { mutation: true, status: 201 },
  );
}
