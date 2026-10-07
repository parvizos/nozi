import type { Metadata } from "next";
import { CatalogBrowser } from "../../components/catalog-browser";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";

export const metadata: Metadata = {
  title: "Каталог подарков",
  description:
    "Цветы, подарочные боксы, сладости и подарки от магазинов Душанбе.",
};
export const dynamic = "force-dynamic";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-xs font-bold tracking-[0.16em] text-[#8f2d56] uppercase">
          NOZI Market
        </p>
        <h1 className="display-font mt-2 text-4xl sm:text-5xl">
          Подарки для любого повода
        </h1>
        <p className="mt-3 max-w-2xl text-[#756865]">
          Выбирайте среди локальных магазинов Душанбе. Все цены и наличие
          загружаются из каталога.
        </p>
        <div className="mt-10">
          <CatalogBrowser basePath="/catalog" searchParams={params} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
