export function CourierHistoryCard({
  delivery,
}: {
  delivery: {
    deliveredAt: Date | null;
    deliveryArea: string | null;
    id: string;
    orderNumber: string;
    status: string;
    storeName: string;
    updatedAt: Date;
  };
}) {
  return (
    <article className="rounded-3xl border border-[#d8e4dd] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-wider text-[#557667] uppercase">
            {delivery.orderNumber}
          </p>
          <h2 className="mt-1 text-xl font-black">{delivery.storeName}</h2>
        </div>
        <span className="rounded-full bg-[#e5f3ec] px-3 py-1.5 text-xs font-bold text-[#17624a]">
          {delivery.status}
        </span>
      </div>
      <p className="mt-4 text-sm text-[#4a5f56]">
        Район: {delivery.deliveryArea ?? "не указан"}
      </p>
      <time
        className="mt-2 block text-sm font-semibold"
        dateTime={(delivery.deliveredAt ?? delivery.updatedAt).toISOString()}
      >
        {new Intl.DateTimeFormat("ru-RU", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Dushanbe",
        }).format(delivery.deliveredAt ?? delivery.updatedAt)}
      </time>
    </article>
  );
}
