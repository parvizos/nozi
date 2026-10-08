import Link from "next/link";
import { Permission } from "@nozi/auth";
import { adminOrderFilterSchema, listAdminOrders } from "@nozi/marketplace";
import { requireAdminPageActor } from "../../../lib/require-admin-page";
import { AdminPolling } from "../../../components/admin-polling";
const statuses = [
  "ALL",
  "AWAITING_SELLER_CONFIRMATION",
  "PREPARING",
  "READY_FOR_PICKUP",
  "COURIER_ASSIGNED",
  "ON_THE_WAY",
  "DELIVERED",
  "CANCELLED",
] as const;
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const filter = adminOrderFilterSchema.parse({
    page: raw.page,
    query: raw.query,
    status: raw.status,
  });
  const data = await listAdminOrders(
    await requireAdminPageActor(Permission.OrdersRead),
    filter,
  );
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[.18em] text-[#a22f59] uppercase">
            Live operations
          </p>
          <h1 className="mt-2 text-4xl font-semibold">Все заказы</h1>
        </div>
        <AdminPolling />
      </div>
      <form className="mt-6 flex flex-wrap gap-3">
        <input
          className="min-w-64 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3"
          defaultValue={filter.query}
          name="query"
          placeholder="Номер, клиент или магазин"
        />
        <select
          className="rounded-xl border border-slate-300 bg-white px-4 py-3"
          defaultValue={filter.status}
          name="status"
        >
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="rounded-xl bg-[#172131] px-5 py-3 font-semibold text-white">
          Применить
        </button>
      </form>
      <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="hidden grid-cols-[1.1fr_1fr_1fr_.8fr_.8fr_.7fr] gap-4 border-b bg-slate-50 px-5 py-3 text-xs font-bold text-slate-500 uppercase lg:grid">
          <span>Заказ</span>
          <span>Магазин / клиент</span>
          <span>Доставка</span>
          <span>Статус</span>
          <span>Курьер</span>
          <span>Итого / SLA</span>
        </div>
        <div className="divide-y">
          {data.items.map((o) => (
            <Link
              className="grid gap-3 p-5 hover:bg-slate-50 lg:grid-cols-[1.1fr_1fr_1fr_.8fr_.8fr_.7fr] lg:items-center"
              href={`/admin/orders/${o.orderNumber}`}
              key={o.orderNumber}
            >
              <span>
                <strong>{o.orderNumber}</strong>
                <small className="block text-slate-500">
                  {new Intl.DateTimeFormat("ru-RU", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(o.createdAt))}
                </small>
              </span>
              <span>
                {o.store.name}
                <small className="block text-slate-500">
                  {o.customer.name}
                </small>
              </span>
              <span className="text-sm">
                {o.requestedDeliveryDate}
                <br />
                {o.requestedDeliveryWindowStart}–{o.requestedDeliveryWindowEnd}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">
                {o.status}
              </span>
              <span>{o.courierAssignments[0]?.courier.name ?? "—"}</span>
              <span>
                <strong>
                  {o.grandTotal} {o.currencyCode}
                </strong>
                <small
                  className={
                    o.ageMinutes > 15
                      ? "block text-rose-700"
                      : "block text-slate-500"
                  }
                >
                  {o.ageMinutes} мин.
                </small>
              </span>
            </Link>
          ))}
        </div>
        {!data.items.length ? (
          <p className="p-14 text-center text-slate-500">Заказы не найдены</p>
        ) : null}
      </section>
      <div className="mt-5 flex justify-between text-sm">
        <span>{data.total} заказов</span>
        <div className="flex gap-2">
          {data.page > 1 ? (
            <Link
              className="rounded-lg border bg-white px-4 py-2"
              href={`/admin/orders?status=${filter.status}&query=${filter.query}&page=${data.page - 1}`}
            >
              Назад
            </Link>
          ) : null}
          {data.page < data.totalPages ? (
            <Link
              className="rounded-lg border bg-white px-4 py-2"
              href={`/admin/orders?status=${filter.status}&query=${filter.query}&page=${data.page + 1}`}
            >
              Далее
            </Link>
          ) : null}
        </div>
      </div>
    </>
  );
}
