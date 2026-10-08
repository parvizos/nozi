import Link from "next/link";
const links = [
  ["/admin", "Обзор"],
  ["/admin/orders", "Заказы"],
  ["/admin/sellers", "Продавцы"],
  ["/admin/products", "Товары"],
  ["/admin/customers", "Клиенты"],
  ["/admin/couriers", "Курьеры"],
  ["/admin/categories", "Категории"],
  ["/admin/finance", "Финансы"],
  ["/admin/audit", "Аудит"],
] as const;
export function AdminNavigation() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-[#101722]/95 text-white backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-5 py-4">
        <Link className="text-2xl font-black tracking-[-.08em]" href="/admin">
          NOZI<span className="text-[#e0618f]">.</span>
          <small className="ml-2 text-[10px] tracking-widest text-slate-400 uppercase">
            Control
          </small>
        </Link>
        <nav
          className="ml-auto flex gap-1 overflow-x-auto text-sm font-semibold"
          aria-label="Admin navigation"
        >
          {links.map(([href, label]) => (
            <Link
              className="rounded-lg px-3 py-2 whitespace-nowrap text-slate-300 hover:bg-slate-800 hover:text-white"
              href={href}
              key={href}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
