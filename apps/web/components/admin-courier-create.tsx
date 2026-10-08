"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
export function AdminCourierCreate() {
  const router = useRouter();
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const response = await fetch("/api/v1/admin/couriers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: f.get("email"),
        name: f.get("name"),
        phoneE164: f.get("phone"),
        status: "AVAILABLE",
        transportType: f.get("transport"),
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
      className="grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-5"
      onSubmit={submit}
    >
      <input
        className="rounded-lg border px-3 py-2"
        name="name"
        placeholder="Имя"
        required
      />
      <input
        className="rounded-lg border px-3 py-2"
        name="email"
        placeholder="Email"
        required
        type="email"
      />
      <input
        className="rounded-lg border px-3 py-2"
        name="phone"
        placeholder="+992..."
        required
      />
      <select className="rounded-lg border px-3 py-2" name="transport">
        <option>CAR</option>
        <option>SCOOTER</option>
        <option>BICYCLE</option>
      </select>
      <button className="rounded-lg bg-[#172131] px-4 py-2 font-semibold text-white">
        Создать курьера
      </button>
      {error ? (
        <p className="text-sm text-rose-700 md:col-span-5">{error}</p>
      ) : null}
    </form>
  );
}
