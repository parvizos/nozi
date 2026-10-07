import { headers } from "next/headers";
import Link from "next/link";
import { getActorContext } from "@nozi/auth";
import { UserRoleCode } from "@nozi/database";
import { getCartCount } from "@nozi/marketplace";
import { BagIcon, MapPinIcon, SearchIcon } from "./icons";

export async function SiteHeader() {
  const actor = await getActorContext(await headers());
  const customer = actor?.roles.has(UserRoleCode.CUSTOMER) ?? false;
  const cartCount = actor && customer ? await getCartCount(actor) : 0;
  return (
    <header className="sticky top-0 z-40 border-b border-[#eadfda]/80 bg-[#fffaf7]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          className="display-font text-3xl font-bold tracking-[-0.08em] text-[#7f254a]"
          href="/"
          aria-label="NOZI, главная"
        >
          NOZI<span className="text-[#d78ca4]">.</span>
        </Link>
        <div className="hidden h-7 w-px bg-[#e5d8d3] sm:block" />
        <button
          className="hidden items-center gap-2 text-sm font-medium text-[#4e403d] sm:flex"
          type="button"
          aria-label="Текущий город: Душанбе"
        >
          <MapPinIcon className="h-4 w-4 text-[#8f2d56]" /> Душанбе
        </button>
        <form
          action="/search"
          className="relative ml-auto hidden w-full max-w-md md:block"
        >
          <SearchIcon className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-[#897a76]" />
          <input
            aria-label="Поиск подарков и магазинов"
            className="w-full rounded-full border border-[#e9ded9] bg-white py-2.5 pr-4 pl-11 text-sm transition outline-none focus:border-[#b56b86] focus:ring-3 focus:ring-[#eed5de]"
            name="query"
            placeholder="Найти подарок..."
            type="search"
          />
        </form>
        <nav
          className="flex items-center gap-2"
          aria-label="Основная навигация"
        >
          <Link
            className="rounded-full px-3 py-2 text-sm font-medium hover:bg-[#f6ece8]"
            href="/catalog"
          >
            Каталог
          </Link>
          <Link
            aria-label={`Корзина, товаров: ${cartCount}`}
            className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#f6ece8]"
            href={customer ? "/cart" : "/sign-in?callbackUrl=/cart"}
          >
            <BagIcon className="h-5 w-5" />
            {cartCount > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#8f2d56] px-1 text-[10px] font-bold text-white">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            ) : null}
          </Link>
          <Link
            className="rounded-full bg-[#2c2523] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#8f2d56]"
            href={customer ? "/account/orders" : "/sign-in"}
          >
            {customer ? "Заказы" : "Войти"}
          </Link>
        </nav>
      </div>
      <form action="/search" className="relative px-4 pb-3 md:hidden">
        <SearchIcon className="pointer-events-none absolute top-[42%] left-8 h-4 w-4 -translate-y-1/2 text-[#897a76]" />
        <input
          aria-label="Поиск подарков и магазинов"
          className="w-full rounded-full border border-[#e9ded9] bg-white py-2.5 pr-4 pl-11 text-sm outline-none"
          name="query"
          placeholder="Найти подарок..."
          type="search"
        />
      </form>
    </header>
  );
}
