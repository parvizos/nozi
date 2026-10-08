import { addAdminOrderNote, adminNoteSchema } from "@nozi/marketplace";
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
    async ({ actor, requestId }) => {
      const input = adminNoteSchema.parse(await request.json());
      return {
        note: await addAdminOrderNote(
          actor,
          orderNumberSchema.parse((await params).orderNumber),
          input.body,
          requestId,
        ),
      };
    },
    { mutation: true, status: 201 },
  );
}
