import {
  categoryCreateSchema,
  createCategory,
  listCategoriesAdmin,
} from "@nozi/marketplace";
import { adminApi } from "../../../../../lib/admin-api";
export function GET(request: Request) {
  return adminApi(request, async ({ actor }) => ({
    categories: await listCategoriesAdmin(actor),
  }));
}
export function POST(request: Request) {
  return adminApi(
    request,
    async ({ actor, requestId }) => ({
      category: await createCategory(
        actor,
        categoryCreateSchema.parse(await request.json()),
        requestId,
      ),
    }),
    { mutation: true, status: 201 },
  );
}
