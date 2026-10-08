import { Permission } from "@nozi/auth";
import { auditFilterSchema, listAuditLogs } from "@nozi/marketplace";
import { requireAdminPageActor } from "../../../lib/require-admin-page";
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const input = auditFilterSchema.parse({
    action: raw.action,
    from: raw.from,
    page: raw.page,
    query: raw.query,
    subjectType: raw.subjectType,
    to: raw.to,
  });
  const data = await listAuditLogs(
    await requireAdminPageActor(Permission.AuditRead),
    input,
  );
  return (
    <>
      <h1 className="text-4xl font-semibold">Audit trail</h1>
      <form className="mt-5 grid gap-3 md:grid-cols-6">
        <input
          className="rounded-xl border bg-white px-4 py-3"
          defaultValue={input.query}
          name="query"
          placeholder="Action или resource ID"
        />
        <input
          className="rounded-xl border bg-white px-4 py-3"
          defaultValue={input.action}
          name="action"
          placeholder="Action"
        />
        <input
          className="rounded-xl border bg-white px-4 py-3"
          defaultValue={input.subjectType}
          name="subjectType"
          placeholder="Resource type"
        />
        <input
          aria-label="От даты"
          className="rounded-xl border bg-white px-4 py-3"
          defaultValue={input.from}
          name="from"
          type="date"
        />
        <input
          aria-label="До даты"
          className="rounded-xl border bg-white px-4 py-3"
          defaultValue={input.to}
          name="to"
          type="date"
        />
        <button className="rounded-xl bg-[#172131] text-white">Фильтр</button>
      </form>
      <section className="mt-5 overflow-hidden rounded-2xl border bg-white">
        <div className="divide-y">
          {data.items.map((e) => (
            <div
              className="grid gap-3 p-5 md:grid-cols-[1fr_1fr_1fr_1fr]"
              key={e.id}
            >
              <span>
                <strong>{e.action}</strong>
                <small className="block text-slate-500">
                  {new Intl.DateTimeFormat("ru-RU", {
                    dateStyle: "short",
                    timeStyle: "medium",
                  }).format(e.createdAt)}
                </small>
              </span>
              <span>
                {e.actor?.name ?? e.actorRole ?? "SYSTEM"}
                <small className="block text-slate-500">{e.actor?.email}</small>
              </span>
              <span>
                {e.subjectType}
                <small className="block break-all text-slate-500">
                  {e.subjectId}
                </small>
              </span>
              <span>
                <small className="block break-all text-slate-500">
                  request {e.requestId ?? "—"}
                </small>
                <code className="mt-1 block overflow-hidden text-xs">
                  {JSON.stringify(e.afterRedacted)}
                </code>
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
