"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

function safeReturnTo(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function OtpVerifyForm({
  phone,
  returnTo,
}: {
  phone: string;
  returnTo: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [seconds, setSeconds] = useState(60);
  const [developmentCode, setDevelopmentCode] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      const developmentOtp = sessionStorage.getItem("nozi-development-otp");
      setDevelopmentCode(developmentOtp);
      if (developmentOtp) setCode(developmentOtp);
    }, 0);
    const interval = window.setInterval(
      () => setSeconds((value) => Math.max(0, value - 1)),
      1_000,
    );
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, []);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/phone-number/verify", {
        body: JSON.stringify({ code, phoneNumber: phone }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        setError("Неверный или истёкший код");
        return;
      }
      sessionStorage.removeItem("nozi-development-otp");
      router.push(safeReturnTo(returnTo));
      router.refresh();
    } catch {
      setError("Сервис временно недоступен. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  async function resend() {
    setPending(true);
    setError(null);
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
        setError(result.message ?? "Не удалось отправить новый код");
        return;
      }
      setDevelopmentCode(result.developmentCode ?? null);
      if (result.developmentCode) setCode(result.developmentCode);
      setSeconds(60);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="mt-7 space-y-4" onSubmit={verify}>
      <label className="block text-sm font-medium">
        Код из SMS
        <input
          autoComplete="one-time-code"
          autoFocus
          className="mt-2 w-full rounded-2xl border border-[#dfd2cd] bg-white px-4 py-3 text-center text-2xl tracking-[0.35em] outline-none focus:border-[#a95676] focus:ring-3 focus:ring-[#eed5de]"
          inputMode="numeric"
          maxLength={6}
          minLength={6}
          name="code"
          pattern="[0-9]{6}"
          required
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          value={code}
        />
      </label>
      {developmentCode ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Development OTP: {developmentCode}
        </p>
      ) : null}
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
        {pending ? "Проверяем…" : "Продолжить"}
      </button>
      <button
        className="w-full text-sm font-semibold text-[#8f2d56] disabled:text-[#9b8e89]"
        disabled={pending || seconds > 0}
        onClick={() => void resend()}
        type="button"
      >
        {seconds > 0
          ? `Отправить снова через ${seconds} сек.`
          : "Отправить новый код"}
      </button>
    </form>
  );
}
