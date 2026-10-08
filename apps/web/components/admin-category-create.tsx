"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
export function AdminCategoryCreate() {
  const router = useRouter();
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const response = await fetch("/api/v1/admin/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: f.get("name"),
        slug: f.get("slug"),
        sortOrder: Number(f.get("sortOrder")),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    if (!response.ok) {
      setError(data.message ?? "Ошибка");
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }
  return (
    <form
      className="grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-4"
      onSubmit={submit}
    >
      <input
        className="rounded-lg border px-3 py-2"
        name="name"
        placeholder="Название"
        required
      />
      <input
        className="rounded-lg border px-3 py-2"
        name="slug"
        pattern="[a-z0-9-]+"
        placeholder="slug"
        required
      />
      <input
        className="rounded-lg border px-3 py-2"
        min="0"
        name="sortOrder"
        placeholder="Порядок"
        type="number"
      />
      <button className="rounded-lg bg-[#172131] text-white">Создать</button>
      {error ? <p className="text-rose-700 md:col-span-4">{error}</p> : null}
    </form>
  );
}
