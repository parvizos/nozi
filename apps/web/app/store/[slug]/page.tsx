import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getStoreBySlug } from "@nozi/marketplace";
import { CatalogBrowser } from "../../../components/catalog-browser";
import { MapPinIcon, StarIcon } from "../../../components/icons";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: Pick<Props, "params">): Promise<Metadata> {
  const store = await getStoreBySlug((await params).slug);
  return store
    ? { title: store.name, description: store.description }
    : { title: "Магазин не найден" };
}
export default async function StorePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const [store, query] = await Promise.all([
    getStoreBySlug(slug),
    searchParams,
  ]);
  if (!store) notFound();
  return (
    <>
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
          <div className="relative h-56 overflow-hidden rounded-[2rem] bg-[#eadfda] sm:h-72">
            {store.coverImageObjectKey ? (
              <Image
                alt={`Витрина ${store.name}`}
                className="object-cover"
                fill
                priority
                sizes="100vw"
                src={store.coverImageObjectKey}
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
          </div>
          <div className="relative mx-4 -mt-16 rounded-[1.7rem] border border-[#e8dcd7] bg-white p-5 shadow-xl shadow-black/5 sm:mx-8 sm:flex sm:items-end sm:gap-5 sm:p-7">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-4 border-white bg-[#f2e8e3] shadow">
              {store.logoObjectKey ? (
                <Image
                  alt={`Логотип ${store.name}`}
                  fill
                  className="object-cover"
                  sizes="80px"
                  src={store.logoObjectKey}
                />
              ) : null}
            </div>
            <div className="mt-3 flex-1 sm:mt-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="display-font text-3xl sm:text-4xl">
                  {store.name}
                </h1>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${store.isOpen ? "bg-[#e9f3ec] text-[#356344]" : "bg-[#eee9e7] text-[#625450]"}`}
                >
                  {store.isOpen ? "Открыто" : "Сейчас закрыто"}
                </span>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#756865]">
                {store.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-[#655753]">
                <span className="flex items-center gap-1">
                  <StarIcon className="h-4 w-4 text-[#d6964d]" />{" "}
                  {store.ratingAverage} · {store.ratingCount} оценок
                </span>
                <span>Подготовка от {store.defaultPreparationMinutes} мин</span>
                {store.address ? (
                  <span className="flex items-center gap-1">
                    <MapPinIcon className="h-4 w-4" /> {store.address.line1}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <h2 className="display-font mb-8 text-3xl">Витрина магазина</h2>
          <CatalogBrowser
            basePath={`/store/${slug}`}
            lockedStore={slug}
            searchParams={query}
          />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
