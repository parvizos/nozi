"use client";

export default function CourierError({ reset }: { reset: () => void }) {
  return (
    <section className="rounded-3xl border border-red-100 bg-white p-7 text-center">
      <p className="text-4xl" aria-hidden="true">
        !
      </p>
      <h1 className="mt-3 text-2xl font-black">
        Не удалось загрузить доставку
      </h1>
      <p className="mt-2 text-sm text-[#5a7066]">
        Проверьте соединение и повторите запрос.
      </p>
      <button
        className="mt-5 w-full rounded-2xl bg-[#17624a] px-5 py-4 font-bold text-white"
        onClick={reset}
        type="button"
      >
        Повторить
      </button>
    </section>
  );
}
