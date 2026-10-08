import Link from "next/link";

const statusLabels: Record<string, string> = {
  ACCEPTED: "Задание принято",
  ARRIVED_AT_STORE: "В магазине",
  ASSIGNED: "Новое назначение",
  CANCELLED: "Отменено",
  DELIVERED: "Доставлено",
  DELIVERY_FAILED: "Не доставлено",
  ON_THE_WAY: "В пути",
  PICKED_UP: "Заказ получен",
  RETURNING_TO_STORE: "Возврат в магазин",
};

export function CourierDeliveryCard({
  delivery,
}: {
  delivery: {
    id: string;
    order: {
      deliveryAddress: { line1: string } | null;
      orderNumber: string;
      requestedDeliveryWindowEnd: Date;
      requestedDeliveryWindowStart: Date;
      store: { name: string };
    };
    requiresAdminAttention: boolean;
    status: string;
  };
}) {
  const time = (value: Date) =>
    new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(value);
  return (
    <Link
      className="block rounded-3xl border border-[#d8e4dd] bg-white p-5 shadow-[0_12px_35px_rgba(26,79,61,.06)] transition hover:-translate-y-0.5 hover:border-[#8ebca8]"
      href={`/courier/deliveries/${delivery.order.orderNumber}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-wider text-[#557667] uppercase">
            {delivery.order.orderNumber}
          </p>
          <h2 className="mt-1 text-xl font-black">
            {delivery.order.store.name}
          </h2>
        </div>
        <span className="rounded-full bg-[#e5f3ec] px-3 py-1.5 text-xs font-bold text-[#17624a]">
          {statusLabels[delivery.status] ?? delivery.status}
        </span>
      </div>
      <p className="mt-4 text-sm text-[#4a5f56]">
        {delivery.order.deliveryAddress?.line1 ?? "Адрес уточняется"}
      </p>
      <p className="mt-3 font-bold">
        {time(delivery.order.requestedDeliveryWindowStart)}–
        {time(delivery.order.requestedDeliveryWindowEnd)}
      </p>
      {delivery.requiresAdminAttention ? (
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          Operations уведомлён о проблеме
        </p>
      ) : null}
    </Link>
  );
}
