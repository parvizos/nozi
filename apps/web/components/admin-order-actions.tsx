"use client";
import { marketplaceDateInputValue } from "@nozi/marketplace/display";
import { useRouter } from "next/navigation";
import { useState } from "react";
export function AdminOrderActions({
  canReturnToStore,
  couriers,
  orderNumber,
  status,
}: {
  canReturnToStore: boolean;
  couriers: { id: string; name: string }[];
  orderNumber: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [courierId, setCourierId] = useState(couriers[0]?.id ?? "");
  const localToday = marketplaceDateInputValue();
  async function call(path: string, body: unknown) {
    setBusy(true);
    setError("");
    const response = await fetch(
      `/api/v1/admin/orders/${orderNumber}/${path}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    setBusy(false);
    if (!response.ok) {
      setError(data.message ?? "Операция не выполнена");
      return;
    }
    router.refresh();
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "READY_FOR_PICKUP" || status === "COURIER_ASSIGNED" ? (
          <>
            <select
              className="rounded-lg border px-3 py-2"
              onChange={(e) => setCourierId(e.target.value)}
              value={courierId}
            >
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              className="rounded-lg bg-[#172131] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy || !courierId}
              onClick={() =>
                call(
                  status === "READY_FOR_PICKUP"
                    ? "assign-courier"
                    : "reassign-courier",
                  { courierId },
                )
              }
              type="button"
            >
              {status === "READY_FOR_PICKUP"
                ? "Назначить курьера"
                : "Переназначить"}
            </button>
          </>
        ) : null}
        {status === "DELIVERY_FAILED" ? (
          <div className="w-full space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-semibold">Восстановление доставки</p>
            <select
              className="w-full rounded-lg border px-3 py-2"
              onChange={(event) => setCourierId(event.target.value)}
              value={courierId}
            >
              {couriers.map((courier) => (
                <option key={courier.id} value={courier.id}>
                  {courier.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-2">
              <input
                className="rounded-lg border px-2 py-2 text-sm"
                id="retry-date"
                defaultValue={localToday}
                min={localToday}
                required
                type="date"
              />
              <input
                className="rounded-lg border px-2 py-2 text-sm"
                defaultValue="10:00"
                id="retry-start"
                type="time"
              />
              <input
                className="rounded-lg border px-2 py-2 text-sm"
                defaultValue="12:00"
                id="retry-end"
                type="time"
              />
            </div>
            <div className="flex gap-2">
              <button
                className="rounded-lg bg-[#172131] px-3 py-2 text-sm font-semibold text-white"
                disabled={busy || !courierId}
                onClick={() =>
                  void call("retry-delivery", {
                    courierId,
                    deliveryDate: (
                      document.getElementById("retry-date") as HTMLInputElement
                    ).value,
                    deliveryWindowStart: (
                      document.getElementById("retry-start") as HTMLInputElement
                    ).value,
                    deliveryWindowEnd: (
                      document.getElementById("retry-end") as HTMLInputElement
                    ).value,
                  })
                }
                type="button"
              >
                Повторить доставку
              </button>
              {canReturnToStore ? (
                <button
                  className="rounded-lg border px-3 py-2 text-sm font-semibold"
                  disabled={busy}
                  onClick={() => void call("return-to-store", {})}
                  type="button"
                >
                  Вернуть в магазин
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {![
          "DELIVERED",
          "CANCELLED",
          "REFUNDED",
          "PICKED_UP",
          "ON_THE_WAY",
        ].includes(status) ? (
          <button
            className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700"
            disabled={busy}
            onClick={() => {
              const reason = window.prompt("Причина отмены");
              if (reason && window.confirm("Отменить заказ?"))
                void call("cancel", { reason });
            }}
            type="button"
          >
            Отменить заказ
          </button>
        ) : null}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const body = String(form.get("body") ?? "");
          if (body) void call("notes", { body });
        }}
      >
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-lg border px-3 py-2"
            name="body"
            placeholder="Внутренняя заметка"
          />
          <button
            className="rounded-lg border px-4 py-2 text-sm font-semibold"
            disabled={busy}
          >
            Добавить
          </button>
        </div>
      </form>
      {error ? (
        <p className="text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
