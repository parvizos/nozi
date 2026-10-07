import type { Metadata } from "next";
import { CatalogBrowser } from "../../components/catalog-browser";
import { SearchIcon } from "../../components/icons";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";

export const metadata: Metadata = {
  title: "Поиск подарков",
  robots: { index: false },
};
export const dynamic = "force-dynamic";
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.query;
  const query = Array.isArray(raw) ? raw[0] : raw;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-xs font-bold tracking-[0.16em] text-[#8f2d56] uppercase">
          Поиск
        </p>
        <h1 className="display-font mt-2 text-4xl sm:text-5xl">
          {query ? `Результаты для «${query}»` : "Найдите идеальный подарок"}
        </h1>
        <form action="/search" className="relative mt-6 max-w-2xl">
          <SearchIcon className="absolute top-1/2 left-5 h-5 w-5 -translate-y-1/2 text-[#897a76]" />
          <input
            autoFocus={!query}
            className="w-full rounded-full border border-[#dfd2cd] bg-white py-4 pr-32 pl-13 outline-none focus:border-[#b56b86] focus:ring-3 focus:ring-[#eed5de]"
            defaultValue={query}
            name="query"
            placeholder="Букет, торт или магазин"
            type="search"
          />
          <button
            className="absolute top-1.5 right-1.5 bottom-1.5 rounded-full bg-[#2c2523] px-6 text-sm font-semibold text-white"
            type="submit"
          >
            Найти
          </button>
        </form>
        <div className="mt-10">
          <CatalogBrowser basePath="/search" searchParams={params} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
