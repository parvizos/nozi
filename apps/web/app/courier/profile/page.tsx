import { getCourierShell } from "@nozi/marketplace";

import { requireCourierPageActor } from "../../../lib/require-courier-page";

export default async function CourierProfilePage() {
  const courier = await getCourierShell(await requireCourierPageActor());
  return (
    <>
      <p className="text-xs font-bold tracking-widest text-[#58806e] uppercase">
        Аккаунт
      </p>
      <h1 className="mt-1 text-3xl font-black">Профиль курьера</h1>
      <section className="mt-6 rounded-3xl border border-[#d8e4dd] bg-white p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold text-[#668174] uppercase">Имя</p>
            <p className="mt-1 text-xl font-black">{courier.name}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-[#668174] uppercase">Статус</p>
            <p className="mt-1 text-xl font-black">{courier.status}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-[#668174] uppercase">
              Транспорт
            </p>
            <p className="mt-1 font-bold">
              {courier.transportType ?? "Не указан"}
            </p>
          </div>
        </div>
        {courier.status === "SUSPENDED" || !courier.isActive ? (
          <p className="mt-6 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-800">
            Профиль приостановлен. Выполнение delivery actions недоступно —
            свяжитесь с operations.
          </p>
        ) : null}
      </section>
    </>
  );
}
