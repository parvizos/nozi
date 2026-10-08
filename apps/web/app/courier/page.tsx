import { getCourierDashboard } from "@nozi/marketplace";

import { CourierDeliveryCard } from "../../components/courier-delivery-card";
import { requireCourierPageActor } from "../../lib/require-courier-page";

export default async function CourierDashboardPage() {
  const dashboard = await getCourierDashboard(await requireCourierPageActor());
  const current = dashboard.active[0];
  return (
    <>
      <section className="rounded-3xl bg-[#163e30] p-6 text-white shadow-xl shadow-[#163e30]/10">
        <p className="text-sm font-bold text-[#a9d8c4]">Сегодня</p>
        <div className="mt-3 flex items-end justify-between gap-5">
          <div>
            <p className="text-4xl font-black">{dashboard.deliveredToday}</p>
            <p className="mt-1 text-sm text-[#d4ebe1]">доставок завершено</p>
          </div>
          <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold">
            {dashboard.courier.status}
          </span>
        </div>
      </section>

      <section className="mt-7">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold tracking-widest text-[#58806e] uppercase">
              Следующий шаг
            </p>
            <h1 className="mt-1 text-3xl font-black">Активная доставка</h1>
          </div>
          <span className="rounded-full bg-white px-3 py-1.5 text-sm font-bold">
            {dashboard.active.length}
          </span>
        </div>
        <div className="mt-4">
          {current ? (
            <CourierDeliveryCard delivery={current} />
          ) : (
            <div className="rounded-3xl border border-dashed border-[#aac5b8] bg-white/60 p-8 text-center">
              <p className="text-4xl" aria-hidden="true">
                ✓
              </p>
              <h2 className="mt-3 text-xl font-black">Активных доставок нет</h2>
              <p className="mt-2 text-sm text-[#597166]">
                Новое назначение появится здесь автоматически после действий
                operations.
              </p>
            </div>
          )}
        </div>
      </section>

      {dashboard.active.length > 1 ? (
        <section className="mt-8">
          <h2 className="text-xl font-black">Следующие задания</h2>
          <div className="mt-4 space-y-4">
            {dashboard.active.slice(1).map((delivery) => (
              <CourierDeliveryCard delivery={delivery} key={delivery.id} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
