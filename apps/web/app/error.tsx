"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="max-w-md text-center">
        <p className="text-xs font-bold tracking-[0.16em] text-[#8f2d56] uppercase">
          Что-то пошло не так
        </p>
        <h1 className="display-font mt-3 text-4xl">
          Не удалось открыть витрину
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#756865]">
          Обновите страницу или повторите попытку через минуту.
        </p>
        <button
          className="mt-6 rounded-full bg-[#2c2523] px-6 py-3 text-sm font-semibold text-white"
          onClick={reset}
          type="button"
        >
          Попробовать снова
        </button>
      </div>
    </main>
  );
}
