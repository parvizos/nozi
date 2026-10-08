import { adminPageSchema, listAdminProducts } from "@nozi/marketplace";
import { adminApi } from "../../../../../lib/admin-api";
export function GET(request: Request) {
  return adminApi(request, async ({ actor }) => ({
    products: await listAdminProducts(
      actor,
      adminPageSchema.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    ),
  }));
}
