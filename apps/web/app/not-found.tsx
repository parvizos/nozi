import Link from "next/link";
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="max-w-md text-center">
        <p className="text-xs font-bold tracking-[0.16em] text-[#8f2d56] uppercase">
          404
        </p>
        <h1 className="display-font mt-3 text-4xl">Такого подарка здесь нет</h1>
        <p className="mt-3 text-sm text-[#756865]">
          Возможно, он больше не доступен или ссылка изменилась.
        </p>
        <Link
          className="mt-6 inline-flex rounded-full bg-[#2c2523] px-6 py-3 text-sm font-semibold text-white"
          href="/catalog"
        >
          Перейти в каталог
        </Link>
      </div>
    </main>
  );
}
