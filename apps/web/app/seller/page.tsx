import Link from "next/link";
import { getSellerDashboard } from "@nozi/marketplace";
import { orderStatusMetadata } from "@nozi/marketplace/display";
import { requireSellerPageActor } from "../../lib/require-seller-page";

export default async function SellerDashboardPage() {
  const data = await getSellerDashboard(await requireSellerPageActor());
  const cards = [
    ["Заказов сегодня", data.ordersToday],
    ["Ждут ответа", data.awaitingConfirmation],
    ["Готовятся", data.preparing],
    ["Готовы к выдаче", data.readyForPickup],
    ["Выручка сегодня", `${data.revenueToday} TJS`],
    ["Средний чек", `${data.averageOrderValue} TJS`],
    ["Активные товары", data.activeProducts],
    ["Заканчиваются", data.lowStockProducts],
  ];
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-bold tracking-[.18em] text-[#9a355c] uppercase">
            Seller workspace
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            Операционный обзор
          </h1>
          <p className="mt-2 text-[#6f6863]">
            Новые заказы и состояние магазина на сегодня.
          </p>
        </div>
        <Link
          className="rounded-xl bg-[#8f2d56] px-5 py-3 text-sm font-semibold text-white"
          href="/seller/orders?status=AWAITING_SELLER_CONFIRMATION"
        >
          Открыть новые заказы
        </Link>
      </div>
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <article
            className="rounded-2xl border border-[#ded9d2] bg-white p-5 shadow-sm"
            key={label}
          >
            <p className="text-sm text-[#756e69]">{label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight">
              {value}
            </p>
          </article>
        ))}
      </section>
      <section className="mt-8 rounded-2xl border border-[#ded9d2] bg-white">
        <div className="flex items-center justify-between border-b border-[#ebe7e2] p-5">
          <h2 className="text-xl font-semibold">Последние заказы</h2>
          <Link
            className="text-sm font-semibold text-[#8f2d56]"
            href="/seller/orders"
          >
            Все заказы →
          </Link>
        </div>
        <div className="divide-y divide-[#ebe7e2]">
          {data.recentOrders.length ? (
            data.recentOrders.map((order) => (
              <Link
                className="grid gap-2 p-5 transition hover:bg-[#faf8f5] sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center"
                href={`/seller/orders/${order.orderNumber}`}
                key={order.orderNumber}
              >
                <strong>{order.orderNumber}</strong>
                <span className="text-sm text-[#756e69]">
                  {order.store.name}
                </span>
                <span className="rounded-full bg-[#f5e9ee] px-3 py-1 text-xs font-bold text-[#8f2d56]">
                  {orderStatusMetadata[order.status].shortLabel}
                </span>
                <span className="font-semibold">{order.grandTotal} TJS</span>
              </Link>
            ))
          ) : (
            <p className="p-10 text-center text-[#756e69]">Заказов пока нет</p>
          )}
        </div>
      </section>
    </>
  );
}
