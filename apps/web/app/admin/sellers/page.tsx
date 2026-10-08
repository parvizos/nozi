import Link from "next/link";
import { Permission } from "@nozi/auth";
import { adminPageSchema, listAdminSellers } from "@nozi/marketplace";
import { requireAdminPageActor } from "../../../lib/require-admin-page";
export default async function AdminSellersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const input = adminPageSchema.parse({ page: raw.page, query: raw.query });
  const data = await listAdminSellers(
    await requireAdminPageActor(Permission.SellersRead),
    input,
  );
  return (
    <>
      <h1 className="text-4xl font-semibold">Продавцы</h1>
      <form className="mt-5 flex gap-2">
        <input
          className="flex-1 rounded-xl border bg-white px-4 py-3"
          defaultValue={input.query}
          name="query"
          placeholder="Название продавца"
        />
        <button className="rounded-xl bg-[#172131] px-5 text-white">
          Найти
        </button>
      </form>
      <section className="mt-5 overflow-hidden rounded-2xl border bg-white">
        <div className="divide-y">
          {data.items.map((s) => (
            <Link
              className="grid gap-3 p-5 hover:bg-slate-50 md:grid-cols-[1.5fr_1fr_1fr_1fr_auto] md:items-center"
              href={`/admin/sellers/${s.id}`}
              key={s.id}
            >
              <span>
                <strong>{s.publicName}</strong>
                <small className="block text-slate-500">{s.legalName}</small>
              </span>
              <span className="text-sm font-bold">{s.status}</span>
              <span>{s.storeCount} магазинов</span>
              <span>
                {s.orderCount} заказов · {s.gmv} TJS
              </span>
              <span>Открыть →</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
