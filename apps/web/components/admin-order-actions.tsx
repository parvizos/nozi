"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
export function AdminOrderActions({
  couriers,
  orderNumber,
  status,
}: {
  couriers: { id: string; name: string }[];
  orderNumber: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [courierId, setCourierId] = useState(couriers[0]?.id ?? "");
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
