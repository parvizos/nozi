"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export function SellerProductRowActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function archive() {
    if (!window.confirm("Архивировать товар? Он исчезнет с витрины.")) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/v1/seller/products/${id}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      setError(body.message ?? "Ошибка");
      return;
    }
    router.refresh();
  }
  return (
    <div className="flex items-center justify-end gap-2">
      <Link
        className="rounded-lg border px-3 py-2 text-xs font-semibold"
        href={`/seller/products/${id}`}
      >
        Изменить
      </Link>
      <button
        className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
        disabled={busy}
        onClick={archive}
        type="button"
      >
        {busy ? "…" : "Архив"}
      </button>
      {error ? (
        <span className="sr-only" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
