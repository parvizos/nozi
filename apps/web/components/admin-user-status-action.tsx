"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminUserStatusAction({
  label,
  path,
  status,
}: {
  label: string;
  path: string;
  status: "ACTIVE" | "SUSPENDED";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    const response = await fetch(path, {
      body: JSON.stringify({ reason, status }),
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
    setOpen(false);
    setReason("");
    router.refresh();
  }
  return (
    <div className="space-y-2">
      <button
        className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {label}
      </button>
      {open ? (
        <div className="w-72 space-y-2 rounded-xl border bg-white p-3 shadow-lg">
          <textarea
            aria-label="Причина изменения статуса"
            className="min-h-20 w-full rounded-lg border p-2 text-sm"
            maxLength={500}
            minLength={3}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Обязательная причина"
            value={reason}
          />
          <button
            className="w-full rounded-lg bg-[#172131] px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
            disabled={busy || reason.trim().length < 3}
            onClick={() => void submit()}
            type="button"
          >
            {busy ? "Сохраняем…" : "Подтвердить"}
          </button>
          {error ? <p className="text-xs text-rose-700">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
