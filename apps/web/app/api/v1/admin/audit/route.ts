import { auditFilterSchema, listAuditLogs } from "@nozi/marketplace";
import { adminApi } from "../../../../../lib/admin-api";
export function GET(request: Request) {
  return adminApi(request, async ({ actor }) => ({
    audit: await listAuditLogs(
      actor,
      auditFilterSchema.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    ),
  }));
}
