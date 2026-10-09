"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

function safeReturnTo(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function PhoneAuthForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const phone = String(new FormData(event.currentTarget).get("phone") ?? "");
    try {
      const response = await fetch("/api/v1/auth/otp/request", {
        body: JSON.stringify({ phone }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as {
        developmentCode?: string;
        message?: string;
      };
      if (!response.ok) {
        setError(result.message ?? "Не удалось отправить код");
        return;
      }
      if (result.developmentCode)
        sessionStorage.setItem("nozi-development-otp", result.developmentCode);
      router.push(
        `/verify?phone=${encodeURIComponent(phone)}&returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`,
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
        Номер телефона
        <input
          autoComplete="tel"
          className="mt-2 w-full rounded-2xl border border-[#dfd2cd] bg-white px-4 py-3 text-lg outline-none focus:border-[#a95676] focus:ring-3 focus:ring-[#eed5de]"
          inputMode="tel"
          name="phone"
          placeholder="+992 90 123 45 67"
          required
          type="tel"
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
        className="w-full rounded-full bg-[#8f2d56] px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Отправляем…" : "Получить код"}
      </button>
      <p className="text-center text-xs leading-5 text-[#8b7c77]">
        Вход и регистрация выполняются одним безопасным кодом.
      </p>
    </form>
  );
}
