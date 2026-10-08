"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Hour = {
  closesAt: string | null;
  dayOfWeek: number;
  isClosed: boolean;
  opensAt: string | null;
};
type StoreForm = {
  defaultPreparationMinutes: number;
  deliveryFeeAmount: string;
  description: string;
  id: string;
  isOpen: boolean;
  isTemporarilyPaused: boolean;
  minimumOrderAmount: string;
  name: string;
  openingHours: Hour[];
  pauseReason: string | null;
  phoneE164: string;
};
const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export function SellerStoreForm({ initial }: { initial: StoreForm }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  function set<K extends keyof StoreForm>(key: K, value: StoreForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  function hour(index: number, patch: Partial<Hour>) {
    set(
      "openingHours",
      form.openingHours.map((h, i) => (i === index ? { ...h, ...patch } : h)),
    );
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/v1/seller/store/${form.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const result = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    setBusy(false);
    setMessage(
      response.ok
        ? "Настройки сохранены"
        : (result.message ?? "Не удалось сохранить"),
    );
    if (response.ok) router.refresh();
  }
  return (
    <form
      className="mt-7 grid gap-6 lg:grid-cols-[1.25fr_.75fr]"
      onSubmit={submit}
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-[#ded9d2] bg-white p-6">
          <h2 className="text-xl font-semibold">Профиль магазина</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold sm:col-span-2">
              Название
              <input
                className="mt-2 w-full rounded-xl border p-3 font-normal"
                onChange={(e) => set("name", e.target.value)}
                required
                value={form.name}
              />
            </label>
            <label className="text-sm font-semibold sm:col-span-2">
              Описание
              <textarea
                className="mt-2 min-h-36 w-full rounded-xl border p-3 font-normal"
                minLength={20}
                onChange={(e) => set("description", e.target.value)}
                required
                value={form.description}
              />
            </label>
            <label className="text-sm font-semibold">
              Телефон
              <input
                className="mt-2 w-full rounded-xl border p-3 font-normal"
                onChange={(e) => set("phoneE164", e.target.value)}
                required
                value={form.phoneE164}
              />
            </label>
            <label className="text-sm font-semibold">
              Подготовка, минут
              <input
                className="mt-2 w-full rounded-xl border p-3 font-normal"
                min={5}
                onChange={(e) =>
                  set("defaultPreparationMinutes", Number(e.target.value))
                }
                type="number"
                value={form.defaultPreparationMinutes}
              />
            </label>
            <label className="text-sm font-semibold">
              Минимальный заказ, TJS
              <input
                className="mt-2 w-full rounded-xl border p-3 font-normal"
                onChange={(e) => set("minimumOrderAmount", e.target.value)}
                value={form.minimumOrderAmount}
              />
            </label>
            <label className="text-sm font-semibold">
              Доставка, TJS
              <input
                className="mt-2 w-full rounded-xl border p-3 font-normal"
                onChange={(e) => set("deliveryFeeAmount", e.target.value)}
                value={form.deliveryFeeAmount}
              />
            </label>
          </div>
        </section>
        <section className="rounded-2xl border border-[#ded9d2] bg-white p-6">
          <h2 className="text-xl font-semibold">График</h2>
          <div className="mt-4 space-y-2">
            {form.openingHours.map((h, i) => (
              <div
                className="grid grid-cols-[3rem_1fr_1fr_auto] items-center gap-2"
                key={h.dayOfWeek}
              >
                <strong>{dayNames[i]}</strong>
                <input
                  aria-label={`Открытие ${dayNames[i]}`}
                  className="rounded-lg border p-2"
                  disabled={h.isClosed}
                  onChange={(e) => hour(i, { opensAt: e.target.value })}
                  type="time"
                  value={h.opensAt ?? "09:00"}
                />
                <input
                  aria-label={`Закрытие ${dayNames[i]}`}
                  className="rounded-lg border p-2"
                  disabled={h.isClosed}
                  onChange={(e) => hour(i, { closesAt: e.target.value })}
                  type="time"
                  value={h.closesAt ?? "20:00"}
                />
                <label className="flex gap-1 text-xs">
                  <input
                    checked={h.isClosed}
                    onChange={(e) => hour(i, { isClosed: e.target.checked })}
                    type="checkbox"
                  />{" "}
                  выходной
                </label>
              </div>
            ))}
          </div>
        </section>
      </div>
      <aside className="space-y-6">
        <section className="rounded-2xl border border-[#ded9d2] bg-white p-6">
          <h2 className="text-xl font-semibold">Доступность</h2>
          <label className="mt-5 flex items-center justify-between gap-3">
            <span>
              <strong>Магазин открыт</strong>
              <small className="block text-[#756e69]">
                Принимает новые заказы
              </small>
            </span>
            <input
              checked={form.isOpen}
              className="h-5 w-5"
              onChange={(e) => set("isOpen", e.target.checked)}
              type="checkbox"
            />
          </label>
          <label className="mt-5 flex items-center justify-between gap-3">
            <span>
              <strong>Временная пауза</strong>
              <small className="block text-[#756e69]">
                Скрывает магазин с витрины
              </small>
            </span>
            <input
              checked={form.isTemporarilyPaused}
              className="h-5 w-5"
              onChange={(e) => set("isTemporarilyPaused", e.target.checked)}
              type="checkbox"
            />
          </label>
          {form.isTemporarilyPaused ? (
            <label className="mt-5 block text-sm font-semibold">
              Причина
              <textarea
                className="mt-2 w-full rounded-xl border p-3 font-normal"
                onChange={(e) => set("pauseReason", e.target.value || null)}
                value={form.pauseReason ?? ""}
              />
            </label>
          ) : null}
        </section>
        {message ? (
          <p
            className="rounded-xl bg-[#f4e8ed] p-4 text-sm text-[#7c294c]"
            role="status"
          >
            {message}
          </p>
        ) : null}
        <button
          className="w-full rounded-xl bg-[#8f2d56] px-5 py-3.5 font-semibold text-white disabled:opacity-50"
          disabled={busy}
          type="submit"
        >
          {busy ? "Сохраняем…" : "Сохранить настройки"}
        </button>
        <p className="text-xs leading-5 text-[#756e69]">
          Статус модерации, комиссия и владелец доступны только сотрудникам
          NOZI.
        </p>
      </aside>
    </form>
  );
}
