import Link from "next/link";
export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-[#eadfda] bg-[#2c2523] text-[#f7efeb]">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6 lg:px-8">
        <div>
          <p className="display-font text-3xl font-bold">NOZI.</p>
          <p className="mt-3 max-w-xs text-sm leading-6 text-[#cbbdb8]">
            Подарки от локальных магазинов Душанбе, выбранные с заботой.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold">Покупателям</p>
          <div className="mt-3 flex flex-col gap-2 text-sm text-[#cbbdb8]">
            <Link href="/catalog">Каталог</Link>
            <Link href="/search">Поиск</Link>
            <Link href="/sign-in">Личный кабинет</Link>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold">Город доставки</p>
          <p className="mt-3 text-sm text-[#cbbdb8]">Душанбе · ежедневно</p>
        </div>
      </div>
    </footer>
  );
}
