import Link from "next/link";
import { listSellerOrders, sellerOrderFilterSchema } from "@nozi/marketplace";
import { requireSellerPageActor } from "../../../lib/require-seller-page";

const filters = [
  ["ALL", "Все"],
  ["AWAITING_SELLER_CONFIRMATION", "Новые"],
  ["CONFIRMED", "Подтверждены"],
  ["PREPARING", "Готовятся"],
  ["READY_FOR_PICKUP", "Готовы"],
  ["CANCELLED", "Отменены"],
  ["DELIVERED", "Доставлены"],
] as const;
const labels: Record<string, string> = Object.fromEntries(filters);
export default async function SellerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const filter = sellerOrderFilterSchema.parse({
    page: raw.page,
    status: raw.status,
  });
  const data = await listSellerOrders(await requireSellerPageActor(), filter);
  return (
    <>
      <div>
        <p className="text-xs font-bold tracking-[.18em] text-[#9a355c] uppercase">
          Orders
        </p>
        <h1 className="mt-2 text-4xl font-semibold">Заказы</h1>
      </div>
      <nav className="mt-7 flex gap-2 overflow-x-auto pb-2">
        {filters.map(([value, label]) => (
          <Link
            className={
              filter.status === value
                ? "rounded-full bg-[#24211f] px-4 py-2 text-sm font-semibold whitespace-nowrap text-white"
                : "rounded-full border border-[#d8d2cb] bg-white px-4 py-2 text-sm font-semibold whitespace-nowrap"
            }
            href={`/seller/orders?status=${value}`}
            key={value}
          >
            {label}
          </Link>
        ))}
      </nav>
      <section className="mt-4 overflow-hidden rounded-2xl border border-[#ded9d2] bg-white">
        <div className="hidden grid-cols-[1.2fr_1fr_.5fr_1fr_1fr_auto] gap-4 border-b bg-[#faf8f5] px-5 py-3 text-xs font-bold tracking-wide text-[#756e69] uppercase md:grid">
          <span>Заказ</span>
          <span>Магазин</span>
          <span>Поз.</span>
          <span>Доставка</span>
          <span>Статус</span>
          <span>Итого</span>
        </div>
        {data.items.length ? (
          <div className="divide-y divide-[#ebe7e2]">
            {data.items.map((order) => (
              <Link
                className="grid gap-3 p-5 hover:bg-[#faf8f5] md:grid-cols-[1.2fr_1fr_.5fr_1fr_1fr_auto] md:items-center"
                href={`/seller/orders/${order.orderNumber}`}
                key={order.orderNumber}
              >
                <span>
                  <strong>{order.orderNumber}</strong>
                  <small className="mt-1 block text-[#7b746f]">
                    {new Intl.DateTimeFormat("ru-RU", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(order.createdAt))}
                  </small>
                </span>
                <span>{order.store.name}</span>
                <span>{order.itemCount}</span>
                <span className="text-sm">
                  {order.requestedDeliveryDate}
                  <br />
                  {order.requestedDeliveryWindowStart}–
                  {order.requestedDeliveryWindowEnd}
                </span>
                <span className="text-sm font-semibold text-[#8f2d56]">
                  {labels[order.status] ?? order.status}
                </span>
                <strong>
                  {order.grandTotal} {order.currencyCode}
                </strong>
              </Link>
            ))}
          </div>
        ) : (
          <p className="p-14 text-center text-[#756e69]">
            В этом разделе заказов нет
          </p>
        )}
      </section>
      <div className="mt-5 flex items-center justify-between text-sm">
        <span>
          Страница {data.page} из {data.totalPages} · {data.total} заказов
        </span>
        <div className="flex gap-2">
          {data.page > 1 ? (
            <Link
              className="rounded-lg border bg-white px-4 py-2"
              href={`/seller/orders?status=${filter.status}&page=${data.page - 1}`}
            >
              Назад
            </Link>
          ) : null}
          {data.page < data.totalPages ? (
            <Link
              className="rounded-lg border bg-white px-4 py-2"
              href={`/seller/orders?status=${filter.status}&page=${data.page + 1}`}
            >
              Далее
            </Link>
          ) : null}
        </div>
      </div>
    </>
  );
}
