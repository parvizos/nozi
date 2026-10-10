import Image from "next/image";
import Link from "next/link";

import type { CustomerOrderView } from "@nozi/marketplace";
import {
  formatMarketplaceDateTime,
  orderStatusMetadata,
} from "@nozi/marketplace/display";

import { formatMoney } from "./product-card";

export function OrderView({
  order,
  success = false,
}: {
  order: CustomerOrderView;
  success?: boolean;
}) {
  return (
    <div>
      {success ? (
        <section className="mb-8 rounded-[2rem] bg-[#e7f1e9] px-6 py-9 text-center sm:px-10">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#3f7751] text-2xl text-white">
            ✓
          </div>
          <p className="mt-4 text-xs font-bold tracking-[0.16em] text-[#3f7751] uppercase">
            Заказ оформлен
          </p>
          <h1 className="display-font mt-2 text-4xl sm:text-5xl">
            Спасибо за заказ
          </h1>
          <p className="mt-3 text-sm text-[#56705d]">
            Магазин получил заявку. Следите за статусом на этой странице.
          </p>
        </section>
      ) : null}
      <div className="grid gap-7 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="rounded-[1.7rem] border border-[#e4d7d2] bg-white p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs text-[#756865]">Номер заказа</p>
                <h2 className="mt-1 text-xl font-semibold">
                  {order.orderNumber}
                </h2>
              </div>
              <span className="rounded-full bg-[#f3e5ea] px-4 py-2 text-xs font-semibold text-[#8f2d56]">
                {orderStatusMetadata[order.status].label}
              </span>
            </div>
            <Link
              className="mt-5 inline-flex items-center gap-2 font-medium"
              href={`/store/${order.store.slug}`}
            >
              {order.store.logoObjectKey ? (
                <span className="relative h-9 w-9 overflow-hidden rounded-full bg-[#eee5e0]">
                  <Image
                    alt=""
                    className="object-cover"
                    fill
                    sizes="36px"
                    src={order.store.logoObjectKey}
                  />
                </span>
              ) : null}
              {order.store.name}
            </Link>
          </section>
          <section className="rounded-[1.7rem] border border-[#e4d7d2] bg-white p-5 sm:p-7">
            <h2 className="display-font text-2xl">Состав заказа</h2>
            <div className="mt-5 divide-y divide-[#eee3de]">
              {order.items.map((item) => (
                <div
                  className="flex gap-4 py-4 first:pt-0 last:pb-0"
                  key={item.id}
                >
                  <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-[#eee5e0]">
                    {item.imageObjectKey ? (
                      <Image
                        alt=""
                        className="object-cover"
                        fill
                        sizes="64px"
                        src={item.imageObjectKey}
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.productName}</p>
                    {item.variantName ? (
                      <p className="mt-1 text-xs text-[#756865]">
                        {item.variantName}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-[#756865]">
                      {item.quantity} ×{" "}
                      {formatMoney(item.unitPrice, order.currencyCode)}
                    </p>
                  </div>
                  <p className="font-semibold">
                    {formatMoney(item.lineTotal, order.currencyCode)}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-[1.7rem] border border-[#e4d7d2] bg-white p-5 sm:p-7">
            <h2 className="display-font text-2xl">Доставка</h2>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-[#756865]">Получатель</dt>
                <dd className="mt-1 font-medium">{order.recipientName}</dd>
                <dd className="text-[#655753]">{order.recipientPhoneE164}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#756865]">Дата и время</dt>
                <dd className="mt-1 font-medium">
                  {order.requestedDeliveryDate}
                </dd>
                <dd className="text-[#655753]">
                  {order.requestedDeliveryWindowStart}–
                  {order.requestedDeliveryWindowEnd}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-[#756865]">Адрес</dt>
                <dd className="mt-1 font-medium">
                  {order.deliveryAddress?.cityName},{" "}
                  {order.deliveryAddress?.line1}
                </dd>
                {order.deliveryAddress ? (
                  <dd className="text-[#655753]">
                    {[
                      order.deliveryAddress.apartment &&
                        `кв. ${order.deliveryAddress.apartment}`,
                      order.deliveryAddress.entrance &&
                        `подъезд ${order.deliveryAddress.entrance}`,
                      order.deliveryAddress.floor &&
                        `этаж ${order.deliveryAddress.floor}`,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </dd>
                ) : null}
              </div>
              {order.giftMessage ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-[#756865]">Открытка</dt>
                  <dd className="mt-1 rounded-2xl bg-[#faf1f3] p-4 italic">
                    «{order.giftMessage}»
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
        </div>
        <aside className="space-y-6">
          <section className="rounded-[1.7rem] border border-[#e4d7d2] bg-white p-6">
            <h2 className="display-font text-2xl">Статус</h2>
            <ol className="mt-5 space-y-0">
              {order.statusHistory.map((entry, index) => (
                <li
                  className="relative flex gap-3 pb-6 last:pb-0"
                  key={entry.id}
                >
                  {index < order.statusHistory.length - 1 ? (
                    <span className="absolute top-4 left-[7px] h-full w-px bg-[#d9c9c3]" />
                  ) : null}
                  <span className="relative mt-1.5 h-4 w-4 shrink-0 rounded-full border-4 border-[#f4dce4] bg-[#8f2d56]" />
                  <div>
                    <p className="text-sm font-medium">
                      {orderStatusMetadata[entry.newStatus].label}
                    </p>
                    <time
                      className="text-xs text-[#81736e]"
                      dateTime={entry.createdAt}
                    >
                      {formatMarketplaceDateTime(entry.createdAt)}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section className="rounded-[1.7rem] border border-[#e4d7d2] bg-white p-6">
            <h2 className="display-font text-2xl">Оплата</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt>Товары</dt>
                <dd>{formatMoney(order.itemsSubtotal, order.currencyCode)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Доставка</dt>
                <dd>{formatMoney(order.deliveryFee, order.currencyCode)}</dd>
              </div>
              <div className="flex justify-between border-t border-[#eadfda] pt-4 text-base font-semibold">
                <dt>Итого</dt>
                <dd>{formatMoney(order.grandTotal, order.currencyCode)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-[#756865]">
              {order.payment?.method === "CASH"
                ? "Оплата наличными при получении"
                : "Тестовая оплата проведена"}
            </p>
          </section>
          {success ? (
            <Link
              className="flex justify-center rounded-full bg-[#2c2523] px-5 py-3 text-sm font-semibold text-white"
              href={`/orders/${order.orderNumber}`}
            >
              Открыть страницу статуса
            </Link>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
