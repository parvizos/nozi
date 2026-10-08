import { categoryUpdateSchema, updateCategory } from "@nozi/marketplace";
import { adminApi, uuidSchema } from "../../../../../../lib/admin-api";
export function PATCH(
  request: Request,
  { params }: { params: Promise<{ categoryId: string }> },
) {
  return adminApi(
    request,
    async ({ actor, requestId }) => ({
      category: await updateCategory(
        actor,
        uuidSchema.parse((await params).categoryId),
        categoryUpdateSchema.parse(await request.json()),
        requestId,
      ),
    }),
    { mutation: true },
  );
}
