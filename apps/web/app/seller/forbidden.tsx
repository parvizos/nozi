import Link from "next/link";
export default function SellerForbidden() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f3ef] px-6 text-center">
      <div>
        <p className="text-sm font-bold tracking-[.18em] text-[#9a355c] uppercase">
          403 · Доступ закрыт
        </p>
        <h1 className="mt-3 text-4xl font-semibold">
          Seller workspace недоступен
        </h1>
        <p className="mt-3 text-[#6f6863]">
          Нужна активная роль продавца и доступ к магазину.
        </p>
        <Link
          className="mt-7 inline-flex rounded-xl bg-[#24211f] px-5 py-3 text-sm font-semibold text-white"
          href="/"
        >
          Вернуться в NOZI
        </Link>
      </div>
    </main>
  );
}
