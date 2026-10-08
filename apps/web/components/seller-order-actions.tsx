"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Action = "accept" | "prepare" | "ready" | "reject";
const labels: Record<Action, string> = {
  accept: "Принять заказ",
  prepare: "Начать готовить",
  ready: "Готов к выдаче",
  reject: "Отклонить",
};
export function SellerOrderActions({
  allowed,
  orderNumber,
  version,
}: {
  allowed: Action[];
  orderNumber: string;
  version: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState("");
  async function act(action: Action) {
    let body: Record<string, unknown> = { expectedVersion: version };
    if (action === "reject") {
      const reason = window.prompt(
        "Причина: OUT_OF_STOCK, STORE_CLOSED, CANNOT_PREPARE_IN_TIME, INVALID_ORDER или OTHER",
        "OUT_OF_STOCK",
      );
      if (!reason) return;
      const note = window.prompt("Комментарий (необязательно)") ?? undefined;
      body = { note, reason };
    }
    if (!window.confirm(`${labels[action]}?`)) return;
    setBusy(action);
    setError("");
    const response = await fetch(
      `/api/v1/seller/orders/${orderNumber}/${action}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const result = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    setBusy(null);
    if (!response.ok) {
      setError(result.message ?? "Не удалось изменить заказ");
      return;
    }
    router.refresh();
  }
  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {allowed.map((action) => (
          <button
            className={
              action === "reject"
                ? "rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50"
                : "rounded-xl bg-[#24211f] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            }
            disabled={busy !== null}
            key={action}
            onClick={() => act(action)}
            type="button"
          >
            {busy === action ? "Сохраняем…" : labels[action]}
          </button>
        ))}
      </div>
      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
