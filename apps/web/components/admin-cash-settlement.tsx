"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function AdminCashSettlement({
  amount,
  courierId,
  courierName,
  currencyCode,
}: {
  amount: string;
  courierId: string;
  courierName: string;
  currencyCode: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    const response = await fetch("/api/v1/admin/finance/courier-cash", {
      body: JSON.stringify({
        amount: form.get("amount"),
        courierId,
        currencyCode,
        idempotencyKey: crypto.randomUUID(),
        reason: form.get("reason"),
        reference: form.get("reference") || undefined,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    setPending(false);
    if (!response.ok) setError(body.message ?? "Сверка не записана");
    else router.refresh();
  }
  return (
    <form className="grid gap-2 rounded-xl border p-4" onSubmit={submit}>
      <strong>{courierName}</strong>
      <span className="text-sm">
        К сверке: {amount} {currencyCode}
      </span>
      <input
        className="rounded-lg border px-3 py-2"
        defaultValue={amount}
        name="amount"
        required
      />
      <input
        className="rounded-lg border px-3 py-2"
        name="reference"
        placeholder="Reference (optional)"
      />
      <input
        className="rounded-lg border px-3 py-2"
        minLength={3}
        name="reason"
        placeholder="Причина / подтверждение"
        required
      />
      <button
        className="rounded-lg bg-slate-950 px-3 py-2 text-white disabled:opacity-50"
        disabled={pending}
      >
        {pending ? "Сохраняем…" : "Записать сверку"}
      </button>
      {error ? (
        <span className="text-sm text-rose-700" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
}
