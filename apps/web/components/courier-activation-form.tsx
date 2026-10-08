"use client";

import { useState, type FormEvent } from "react";

export function CourierActivationForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    if (password !== confirmation) {
      setError("Пароли не совпадают");
      setPending(false);
      return;
    }
    const response = await fetch(`/api/v1/courier/activate/${token}`, {
      body: JSON.stringify({ password }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = (await response.json()) as { message?: string };
    if (!response.ok)
      setError(body.message ?? "Не удалось активировать аккаунт");
    else setSuccess(true);
    setPending(false);
  }

  if (success)
    return (
      <div className="rounded-2xl bg-emerald-50 p-5 text-emerald-900">
        Аккаунт активирован. Теперь можно войти в рабочее пространство курьера.
        <a
          className="mt-4 block font-semibold underline"
          href="/sign-in?callbackUrl=/courier"
        >
          Войти
        </a>
      </div>
    );

  return (
    <form className="space-y-4" onSubmit={submit}>
      <label className="block text-sm font-medium">
        Новый пароль
        <input
          className="mt-1 w-full rounded-xl border p-3"
          minLength={12}
          name="password"
          required
          type="password"
        />
      </label>
      <label className="block text-sm font-medium">
        Повторите пароль
        <input
          className="mt-1 w-full rounded-xl border p-3"
          minLength={12}
          name="confirmation"
          required
          type="password"
        />
      </label>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="w-full rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? "Активация…" : "Активировать аккаунт"}
      </button>
    </form>
  );
}
