"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReturnedInventoryActions({ endpoint }: { endpoint: string }) {
  const router = useRouter();
  const [decision, setDecision] = useState<"RESTOCK" | "WRITE_OFF">("RESTOCK");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    const response = await fetch(endpoint, {
      body: JSON.stringify({ decision, reason }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const result = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    setBusy(false);
    if (!response.ok) {
      setError(result.message ?? "Не удалось сохранить решение");
      return;
    }
    router.refresh();
  }
  return (
    <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div>
        <p className="font-bold">Решение по возвращённому товару</p>
        <p className="text-sm text-amber-900">
          До решения товар остаётся в резерве и не продаётся.
        </p>
      </div>
      <select
        className="w-full rounded-xl border bg-white p-3"
        onChange={(event) =>
          setDecision(event.target.value as "RESTOCK" | "WRITE_OFF")
        }
        value={decision}
      >
        <option value="RESTOCK">Вернуть в продажу</option>
        <option value="WRITE_OFF">Списать как непригодный</option>
      </select>
      <textarea
        className="min-h-20 w-full rounded-xl border bg-white p-3"
        maxLength={500}
        minLength={3}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Обязательная причина решения"
        value={reason}
      />
      <button
        className="w-full rounded-xl bg-amber-900 px-4 py-3 font-bold text-white disabled:opacity-50"
        disabled={busy || reason.trim().length < 3}
        onClick={() => void submit()}
        type="button"
      >
        {busy ? "Сохраняем…" : "Подтвердить решение"}
      </button>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
