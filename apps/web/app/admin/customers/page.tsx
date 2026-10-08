import Link from "next/link";
import { Permission } from "@nozi/auth";
import { adminPageSchema, listAdminCustomers } from "@nozi/marketplace";
import { requireAdminPageActor } from "../../../lib/require-admin-page";
export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const input = adminPageSchema.parse({ page: raw.page, query: raw.query });
  const data = await listAdminCustomers(
    await requireAdminPageActor(Permission.CustomersRead),
    input,
  );
  return (
    <>
      <h1 className="text-4xl font-semibold">Покупатели</h1>
      <form className="mt-5 flex gap-2">
        <input
          className="flex-1 rounded-xl border bg-white px-4 py-3"
          defaultValue={input.query}
          name="query"
          placeholder="Имя, email или телефон"
        />
        <button className="rounded-xl bg-[#172131] px-5 text-white">
          Найти
        </button>
      </form>
      <section className="mt-5 overflow-hidden rounded-2xl border bg-white">
        <div className="divide-y">
          {data.items.map((u) => (
            <Link
              className="grid gap-3 p-5 hover:bg-slate-50 md:grid-cols-[1.5fr_1.5fr_.7fr_.7fr_auto]"
              href={`/admin/customers/${u.id}`}
              key={u.id}
            >
              <strong>{u.name}</strong>
              <span>
                {u.email}
                <small className="block text-slate-500">
                  {u.phoneE164 ?? "Нет телефона"}
                </small>
              </span>
              <span>{u.status}</span>
              <span>{u._count.orders} заказов</span>
              <span>Открыть →</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
