import Link from "next/link";

export function CourierNavigation({
  courier,
}: {
  courier: { name: string; status: string };
}) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[#d9e2dc] bg-[#f8fbf9]/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link
            className="text-2xl font-black tracking-[-.08em] text-[#17624a]"
            href="/courier"
          >
            NOZI<span className="text-[#6fba99]">.</span>
          </Link>
          <div className="ml-auto text-right">
            <p className="text-sm font-bold">{courier.name}</p>
            <p className="text-[11px] font-semibold tracking-wide text-[#4f7768] uppercase">
              {courier.status}
            </p>
          </div>
        </div>
      </header>
      <nav
        aria-label="Courier navigation"
        className="fixed right-0 bottom-0 left-0 z-50 border-t border-[#d9e2dc] bg-white/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] backdrop-blur"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-4 gap-1 pt-2 text-center text-xs font-bold">
          <Link
            className="rounded-xl px-2 py-3 hover:bg-[#eaf4ef]"
            href="/courier"
          >
            Главная
          </Link>
          <Link
            className="rounded-xl px-2 py-3 hover:bg-[#eaf4ef]"
            href="/courier/deliveries"
          >
            Доставки
          </Link>
          <Link
            className="rounded-xl px-2 py-3 hover:bg-[#eaf4ef]"
            href="/courier/history"
          >
            История
          </Link>
          <Link
            className="rounded-xl px-2 py-3 hover:bg-[#eaf4ef]"
            href="/courier/profile"
          >
            Профиль
          </Link>
        </div>
      </nav>
    </>
  );
}
