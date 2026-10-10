"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminProductModerationActions({
  productId,
  status,
}: {
  productId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function moderate(nextStatus: "ACTIVE" | "HIDDEN" | "REJECTED") {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/v1/admin/products/${productId}`, {
      body: JSON.stringify({
        ...(nextStatus === "REJECTED" ? { note: reason } : {}),
        status: nextStatus,
      }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    const result = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    setBusy(false);
    if (!response.ok) {
      setError(result.message ?? "Не удалось изменить статус");
      return;
    }
    setRejecting(false);
    setReason("");
    router.refresh();
  }

  if (status === "PENDING_REVIEW") {
    return (
      <div className="min-w-52 space-y-2">
        <div className="flex gap-2">
          <button
            className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => void moderate("ACTIVE")}
            type="button"
          >
            Одобрить
          </button>
          <button
            className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-bold text-rose-700"
            disabled={busy}
            onClick={() => setRejecting(true)}
            type="button"
          >
            Отклонить
          </button>
        </div>
        {rejecting ? (
          <div className="space-y-2 rounded-xl bg-rose-50 p-2">
            <textarea
              aria-label="Причина отклонения"
              className="min-h-20 w-full rounded-lg border bg-white p-2 text-sm"
              maxLength={500}
              minLength={3}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Что нужно исправить"
              value={reason}
            />
            <button
              className="w-full rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
              disabled={busy || reason.trim().length < 3}
              onClick={() => void moderate("REJECTED")}
              type="button"
            >
              Подтвердить отклонение
            </button>
          </div>
        ) : null}
        {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      </div>
    );
  }

  if (status === "ACTIVE" || status === "HIDDEN") {
    return (
      <button
        className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50"
        disabled={busy}
        onClick={() => void moderate(status === "ACTIVE" ? "HIDDEN" : "ACTIVE")}
        type="button"
      >
        {status === "ACTIVE" ? "Скрыть" : "Показать"}
      </button>
    );
  }
  return null;
}
