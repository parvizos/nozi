"use client";

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <section className="rounded-2xl border border-red-200 bg-white p-8">
      <p className="text-sm font-semibold tracking-wide text-red-600 uppercase">
        Ошибка
      </p>
      <h1 className="mt-2 text-2xl font-semibold">
        Не удалось загрузить данные
      </h1>
      <p className="mt-2 text-slate-600">
        Повторите запрос. Если ошибка сохранится, проверьте audit trail и server
        logs.
      </p>
      <button
        className="mt-5 rounded-xl bg-[#172131] px-5 py-3 text-white"
        onClick={reset}
        type="button"
      >
        Повторить
      </button>
    </section>
  );
}
