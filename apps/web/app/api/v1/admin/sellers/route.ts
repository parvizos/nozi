import { adminPageSchema, listAdminSellers } from "@nozi/marketplace";
import { adminApi } from "../../../../../lib/admin-api";
export function GET(request: Request) {
  return adminApi(request, async ({ actor }) => ({
    sellers: await listAdminSellers(
      actor,
      adminPageSchema.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    ),
  }));
}
