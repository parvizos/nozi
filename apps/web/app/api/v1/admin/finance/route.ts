import { financeRangeSchema, getFinanceOverview } from "@nozi/marketplace";
import { adminApi } from "../../../../../lib/admin-api";
export function GET(request: Request) {
  return adminApi(request, async ({ actor }) => ({
    finance: await getFinanceOverview(
      actor,
      financeRangeSchema.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    ),
  }));
}
