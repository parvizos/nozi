import { getCourierDelivery, MarketplaceError } from "@nozi/marketplace";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CourierDeliveryActions } from "../../../../components/courier-delivery-actions";
import { requireCourierPageActor } from "../../../../lib/require-courier-page";

const labels: Record<string, string> = {
  ACCEPTED: "Задание принято",
  ARRIVED_AT_STORE: "В магазине",
  ASSIGNED: "Новое назначение",
  CANCELLED: "Отменено",
  DELIVERED: "Доставлено",
  ON_THE_WAY: "В пути к получателю",
  PICKED_UP: "Заказ у курьера",
};

export default async function CourierDeliveryPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  let delivery;
  try {
    delivery = await getCourierDelivery(
      await requireCourierPageActor(),
      (await params).orderNumber,
    );
  } catch (error) {
    if (error instanceof MarketplaceError && error.status === 404) notFound();
    throw error;
  }
  const address = delivery.order.deliveryAddress;
  const storeAddress = delivery.order.store.address;
  const mapQuery = encodeURIComponent(
    [address?.line1, address?.cityName].filter(Boolean).join(", "),
  );
  const time = (value: Date) =>
    new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(value);
  return (
    <>
      <Link
        className="text-sm font-bold text-[#17624a]"
        href="/courier/deliveries"
      >
        ← Все доставки
      </Link>
      <div className="mt-5">
        <p className="text-xs font-bold tracking-widest text-[#58806e] uppercase">
          {delivery.order.orderNumber}
        </p>
        <h1 className="mt-1 text-3xl font-black">
          {labels[delivery.status] ?? delivery.status}
        </h1>
        <p className="mt-2 font-bold text-[#49685b]">
          {time(delivery.order.requestedDeliveryWindowStart)}–
          {time(delivery.order.requestedDeliveryWindowEnd)}
        </p>
      </div>

      <div className="mt-6 space-y-4">
        <section className="rounded-3xl border border-[#d8e4dd] bg-white p-5">
          <p className="text-xs font-bold tracking-wider text-[#668174] uppercase">
            Забрать в магазине
          </p>
          <h2 className="mt-2 text-2xl font-black">
            {delivery.order.store.name}
          </h2>
          <p className="mt-2 text-[#4f675c]">
            {storeAddress?.line1 ?? "Адрес магазина уточняется"}
          </p>
          <p className="mt-2 text-sm">
            Подготовка: {delivery.order.store.defaultPreparationMinutes} мин ·{" "}
            {delivery.order.status}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <a
              className="rounded-2xl bg-[#e7f3ed] px-4 py-3 text-center font-bold text-[#17624a]"
              href={`tel:${delivery.order.store.phoneE164}`}
            >
              Позвонить
            </a>
            <a
              className="rounded-2xl border border-[#bfd3c9] px-4 py-3 text-center font-bold"
              href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(storeAddress?.line1 ?? delivery.order.store.name)}`}
              rel="noreferrer"
              target="_blank"
            >
              Карта
            </a>
          </div>
        </section>

        <section className="rounded-3xl border border-[#d8e4dd] bg-white p-5">
          <p className="text-xs font-bold tracking-wider text-[#668174] uppercase">
            Доставить получателю
          </p>
          <h2 className="mt-2 text-2xl font-black">
            {delivery.order.recipientName}
          </h2>
          <p className="mt-2 text-lg font-bold">{address?.line1}</p>
          <p className="mt-1 text-sm text-[#4f675c]">
            {[
              address?.apartment && `кв. ${address.apartment}`,
              address?.entrance && `подъезд ${address.entrance}`,
              address?.floor && `этаж ${address.floor}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {address?.deliveryNote ? (
            <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm">
              <strong>Комментарий:</strong> {address.deliveryNote}
            </p>
          ) : null}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <a
              className="rounded-2xl bg-[#17624a] px-4 py-3 text-center font-bold text-white"
              href={`tel:${delivery.order.recipientPhoneE164}`}
            >
              Позвонить
            </a>
            <a
              className="rounded-2xl border border-[#bfd3c9] px-4 py-3 text-center font-bold"
              href={`https://www.openstreetmap.org/search?query=${mapQuery}`}
              rel="noreferrer"
              target="_blank"
            >
              Открыть адрес
            </a>
          </div>
        </section>

        <section className="rounded-3xl border border-[#d8e4dd] bg-white p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-wider text-[#668174] uppercase">
                Заказ
              </p>
              <p className="mt-1 font-black">
                {delivery.order.items.reduce(
                  (sum, item) => sum + item.quantity,
                  0,
                )}{" "}
                поз.
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold tracking-wider text-[#668174] uppercase">
                Получить наличными
              </p>
              <p className="mt-1 text-xl font-black">
                {delivery.order.amountToCollect} {delivery.order.currencyCode}
              </p>
            </div>
          </div>
          <div className="mt-4 divide-y">
            {delivery.order.items.map((item, index) => (
              <p
                className="flex justify-between py-3 text-sm"
                key={`${item.productName}-${index}`}
              >
                <span>
                  {item.productName}
                  {item.variantName ? ` · ${item.variantName}` : ""}
                </span>
                <strong>× {item.quantity}</strong>
              </p>
            ))}
          </div>
          {delivery.order.giftMessage ? (
            <p className="mt-3 rounded-2xl bg-[#edf5f1] p-4 text-sm">
              <strong>Подарок:</strong> открытка вложена
              {delivery.order.anonymousDelivery ? ", отправитель анонимен" : ""}
              .
            </p>
          ) : null}
        </section>

        {delivery.requiresAdminAttention ? (
          <p className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            Operations уже получил уведомление о проблеме. После решения можно
            повторить следующий шаг.
          </p>
        ) : null}
        <CourierDeliveryActions
          deliveryCodeRequired={delivery.deliveryCodeRequired}
          orderNumber={delivery.order.orderNumber}
          status={delivery.status}
        />
      </div>
    </>
  );
}
