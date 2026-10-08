import {
  courierDeliveryFilterSchema,
  listCourierDeliveries,
} from "@nozi/marketplace";
import Link from "next/link";

import { CourierDeliveryCard } from "../../../components/courier-delivery-card";
import { requireCourierPageActor } from "../../../lib/require-courier-page";

export default async function CourierDeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const filter = courierDeliveryFilterSchema.parse({
    page: raw.page,
    pageSize: raw.pageSize,
    scope: "ACTIVE",
  });
  const data = await listCourierDeliveries(
    await requireCourierPageActor(),
    filter,
  );
  return (
    <>
      <p className="text-xs font-bold tracking-widest text-[#58806e] uppercase">
        Рабочая очередь
      </p>
      <h1 className="mt-1 text-3xl font-black">Мои доставки</h1>
      <div className="mt-6 space-y-4">
        {data.items.length ? (
          data.items.map((delivery) => (
            <CourierDeliveryCard delivery={delivery} key={delivery.id} />
          ))
        ) : (
          <div className="rounded-3xl border border-dashed border-[#aac5b8] bg-white p-8 text-center">
            Назначенных доставок пока нет.
          </div>
        )}
      </div>
      <div className="mt-6 flex justify-between text-sm font-bold">
        {data.page > 1 ? (
          <Link href={`/courier/deliveries?page=${data.page - 1}`}>
            ← Назад
          </Link>
        ) : (
          <span />
        )}
        {data.page < data.totalPages ? (
          <Link href={`/courier/deliveries?page=${data.page + 1}`}>
            Далее →
          </Link>
        ) : null}
      </div>
    </>
  );
}
