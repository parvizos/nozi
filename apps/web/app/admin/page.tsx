import Link from "next/link";
import { Permission } from "@nozi/auth";
import { getAdminDashboard } from "@nozi/marketplace";
import { requireAdminPageActor } from "../../lib/require-admin-page";
import { AdminPolling } from "../../components/admin-polling";

export default async function AdminDashboardPage() {
  const data = await getAdminDashboard(
    await requireAdminPageActor(Permission.OrdersRead),
  );
  const m = data.metrics;
  const cards = [
    ["Заказов сегодня", m.ordersToday],
    ["GMV сегодня", `${m.gmvToday} TJS`],
    ["Ждут продавца", m.awaitingSeller],
    ["Готовятся", m.preparing],
    ["Готовы к выдаче", m.readyForPickup],
    ["Курьер назначен", m.courierAssigned],
    ["В пути", m.onTheWay],
    ["Доставлены", m.deliveredToday],
    ["Отменены", m.cancelledToday],
    ["Активные продавцы", m.activeSellers],
    ["Активные магазины", m.activeStores],
    ["Активные товары", m.activeProducts],
  ];
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-bold tracking-[.18em] text-[#a22f59] uppercase">
            Operations command center
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            Состояние платформы
          </h1>
          <p className="mt-2 text-slate-600">
            Что требует внимания прямо сейчас.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <AdminPolling />
          <Link
            className="rounded-xl bg-[#172131] px-5 py-3 text-sm font-semibold text-white"
            href="/admin/orders"
          >
            Live orders board
          </Link>
        </div>
      </div>
      <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <article
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            key={label}
          >
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">
              {value}
            </p>
          </article>
        ))}
      </section>
      <div className="mt-7 grid gap-6 lg:grid-cols-[1.4fr_.7fr]">
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b p-5">
            <h2 className="text-xl font-semibold">Operational alerts</h2>
          </div>
          {data.alerts.length ? (
            <div className="divide-y">
              {data.alerts.map((alert, i) => (
                <Link
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-4 p-4 hover:bg-slate-50"
                  href={`/admin/orders/${alert.orderNumber}`}
                  key={`${alert.orderNumber}-${alert.kind}-${i}`}
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <span>
                    <strong>{alert.orderNumber}</strong>
                    <small className="block text-slate-500">
                      {alert.store}
                    </small>
                  </span>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                    {alert.kind}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="p-12 text-center text-slate-500">
              Критических отклонений нет
            </p>
          )}
        </section>
        <aside className="rounded-2xl bg-[#172131] p-6 text-white">
          <h2 className="text-xl font-semibold">Marketplace</h2>
          <dl className="mt-5 space-y-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">Pending sellers</dt>
              <dd className="font-bold">{m.pendingSellers}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Customers</dt>
              <dd className="font-bold">{m.customers}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Active couriers</dt>
              <dd className="font-bold">{m.activeCouriers}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Failed payments</dt>
              <dd className="font-bold text-rose-300">{m.failedPayments}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Paused stores</dt>
              <dd className="font-bold">{m.pausedStores}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </>
  );
}
