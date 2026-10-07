import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getActorContext } from "@nozi/auth";
import { UserRoleCode } from "@nozi/database";
import { listCustomerOrders } from "@nozi/marketplace";

import { formatMoney } from "../../../components/product-card";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";

const labels: Record<string, string> = {
  AWAITING_SELLER_CONFIRMATION: "Ожидает подтверждения",
  CANCELLED: "Отменён",
  CONFIRMED: "Подтверждён",
  COURIER_ASSIGNED: "Курьер назначен",
  CREATED: "Создан",
  DELIVERED: "Доставлен",
  ON_THE_WAY: "В пути",
  PICKED_UP: "Передан курьеру",
  PREPARING: "Готовится",
  READY_FOR_PICKUP: "Готов к передаче",
  REFUNDED: "Возврат",
};
export const metadata: Metadata = {
  title: "Мои заказы",
  robots: { index: false },
};
export const dynamic = "force-dynamic";
export default async function AccountOrdersPage() {
  const actor = await getActorContext(await headers());
  if (!actor?.roles.has(UserRoleCode.CUSTOMER))
    redirect("/sign-in?callbackUrl=/account/orders");
  const orders = await listCustomerOrders(actor);
  return (
    <>
      <SiteHeader />
      <main className="mx-auto min-h-[70vh] max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-xs font-bold tracking-[0.16em] text-[#8f2d56] uppercase">
          Личный кабинет
        </p>
        <h1 className="display-font mt-2 text-4xl sm:text-5xl">Мои заказы</h1>
        {orders.length === 0 ? (
          <div className="mt-10 rounded-[2rem] border border-dashed border-[#d9c8c1] bg-white px-6 py-16 text-center">
            <p className="display-font text-2xl">Заказов пока нет</p>
            <Link
              className="mt-5 inline-flex rounded-full bg-[#2c2523] px-6 py-3 text-sm font-semibold text-white"
              href="/catalog"
            >
              Выбрать подарок
            </Link>
          </div>
        ) : (
          <div className="mt-9 space-y-4">
            {orders.map((order) => (
              <Link
                className="flex flex-wrap items-center justify-between gap-5 rounded-3xl border border-[#e4d7d2] bg-white p-5 transition hover:border-[#b9899a]"
                href={`/orders/${order.orderNumber}`}
                key={order.orderNumber}
              >
                <div>
                  <p className="font-semibold">{order.orderNumber}</p>
                  <p className="mt-1 text-sm text-[#756865]">
                    {order.store.name} ·{" "}
                    {new Intl.DateTimeFormat("ru-RU", {
                      dateStyle: "medium",
                    }).format(new Date(order.createdAt))}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {formatMoney(order.grandTotal, order.currencyCode)}
                  </p>
                  <p className="mt-1 text-xs text-[#8f2d56]">
                    {labels[order.status]}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
