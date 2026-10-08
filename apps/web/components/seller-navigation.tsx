import Link from "next/link";

export function SellerNavigation({
  shell,
}: {
  shell: { role?: string | undefined; stores: { id: string; name: string }[] };
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#ddd8d1] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] items-center gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <Link
          className="text-2xl font-black tracking-[-.08em] text-[#8f2d56]"
          href="/seller"
        >
          NOZI<span className="text-[#d78ca4]">.</span>
        </Link>
        <div className="hidden min-w-0 sm:block">
          <p className="truncate text-sm font-semibold">
            {shell.stores.map((s) => s.name).join(", ")}
          </p>
          <p className="text-[11px] tracking-wider text-[#817974] uppercase">
            {shell.role}
          </p>
        </div>
        <nav
          className="ml-auto flex items-center gap-1 overflow-x-auto text-sm font-semibold"
          aria-label="Seller navigation"
        >
          <Link
            className="rounded-lg px-3 py-2 hover:bg-[#f4ecef]"
            href="/seller"
          >
            Обзор
          </Link>
          <Link
            className="rounded-lg px-3 py-2 hover:bg-[#f4ecef]"
            href="/seller/orders"
          >
            Заказы
          </Link>
          <Link
            className="rounded-lg px-3 py-2 hover:bg-[#f4ecef]"
            href="/seller/products"
          >
            Товары
          </Link>
          <Link
            className="rounded-lg px-3 py-2 hover:bg-[#f4ecef]"
            href="/seller/store"
          >
            Магазин
          </Link>
          <Link
            className="rounded-lg border border-[#ddd8d1] px-3 py-2 hover:bg-[#f5f3ef]"
            href="/"
          >
            Витрина
          </Link>
        </nav>
      </div>
    </header>
  );
}
