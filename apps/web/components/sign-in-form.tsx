"use client";

import { useState, type FormEvent } from "react";

export function SignInForm({ callbackUrl }: { callbackUrl: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        setError("Проверьте email и пароль");
        return;
      }
      window.location.assign(
        callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
          ? callbackUrl
          : "/",
      );
    } catch {
      setError("Сервис временно недоступен. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="mt-7 space-y-4" onSubmit={submit}>
      <label className="block text-sm font-medium">
        Email
        <input
          autoComplete="email"
          className="mt-2 w-full rounded-2xl border border-[#dfd2cd] bg-white px-4 py-3 outline-none focus:border-[#a95676] focus:ring-3 focus:ring-[#eed5de]"
          name="email"
          required
          type="email"
        />
      </label>
      <label className="block text-sm font-medium">
        Пароль
        <input
          autoComplete="current-password"
          className="mt-2 w-full rounded-2xl border border-[#dfd2cd] bg-white px-4 py-3 outline-none focus:border-[#a95676] focus:ring-3 focus:ring-[#eed5de]"
          minLength={12}
          name="password"
          required
          type="password"
        />
      </label>
      {error ? (
        <p
          className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <button
        className="w-full rounded-full bg-[#2c2523] px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Входим…" : "Войти"}
      </button>
    </form>
  );
}
