"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
export function AdminResourceAction({
  body,
  label,
  method = "PATCH",
  path,
  tone = "default",
}: {
  body: Record<string, unknown>;
  label: string;
  method?: "PATCH" | "POST";
  path: string;
  tone?: "default" | "danger";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    if (!window.confirm(`${label}?`)) return;
    setBusy(true);
    setError("");
    const response = await fetch(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    setBusy(false);
    if (!response.ok) {
      setError(data.message ?? "Ошибка");
      return;
    }
    router.refresh();
  }
  return (
    <span>
      <button
        className={
          tone === "danger"
            ? "rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50"
            : "rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50"
        }
        disabled={busy}
        onClick={run}
        type="button"
      >
        {busy ? "…" : label}
      </button>
      {error ? (
        <span className="ml-2 text-xs text-rose-700" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
