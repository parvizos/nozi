import Image from "next/image";
import Link from "next/link";
import { getHomePageData } from "@nozi/marketplace";
import { ArrowIcon, MapPinIcon, SearchIcon } from "../components/icons";
import { ProductGrid } from "../components/product-grid";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { StoreCard } from "../components/store-card";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getHomePageData();
  return (
    <>
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-7xl px-4 pt-7 sm:px-6 sm:pt-10 lg:px-8">
          <div className="relative overflow-hidden rounded-[2rem] bg-[#f1d8d7] px-6 py-10 sm:px-12 sm:py-16 lg:px-16">
            <div className="relative z-10 max-w-2xl">
              <p className="mb-4 flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-[#7f254a] uppercase">
                <MapPinIcon className="h-4 w-4" /> Доставка по Душанбе
              </p>
              <h1 className="display-font text-4xl leading-[1.04] tracking-[-0.035em] text-[#382827] sm:text-6xl lg:text-7xl">
                Повод становится
                <br />
                <em className="font-normal text-[#8f2d56]">особенным.</em>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-[#685553] sm:text-lg">
                Цветы, сладости и подарки от любимых локальных магазинов — для
                тех, кто вам дорог.
              </p>
              <form
                action="/search"
                className="mt-7 flex max-w-xl rounded-full bg-white p-1.5 shadow-xl shadow-[#8f2d56]/10"
              >
                <SearchIcon className="ml-4 h-5 w-5 self-center text-[#8f7b76]" />
                <input
                  aria-label="Что вы хотите подарить?"
                  className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm outline-none"
                  name="query"
                  placeholder="Что вы хотите подарить?"
                  type="search"
                />
                <button
                  className="rounded-full bg-[#2c2523] px-5 text-sm font-semibold text-white"
                  type="submit"
                >
                  Найти
                </button>
              </form>
            </div>
            <div
              aria-hidden="true"
              className="absolute -right-16 -bottom-32 h-[30rem] w-[30rem] rounded-full bg-[#e8aeb5]/55 blur-2xl"
            />
            <div
              aria-hidden="true"
              className="absolute top-10 right-[8%] hidden h-52 w-52 rotate-12 rounded-[4rem] border-2 border-white/50 lg:block"
            />
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.16em] text-[#8f2d56] uppercase">
                Выберите настроение
              </p>
              <h2 className="display-font mt-2 text-3xl sm:text-4xl">
                Категории подарков
              </h2>
            </div>
            <Link
              className="hidden items-center gap-2 text-sm font-semibold sm:flex"
              href="/catalog"
            >
              Весь каталог <ArrowIcon className="h-4 w-4" />
            </Link>
          </div>
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 lg:grid-cols-6">
            {data.categories.map((category) => (
              <Link
                className="group min-w-[150px]"
                href={`/category/${category.slug}`}
                key={category.slug}
              >
                <div className="relative aspect-square overflow-hidden rounded-[1.4rem] bg-[#eee5e0]">
                  {category.imageObjectKey ? (
                    <Image
                      alt=""
                      className="object-cover transition duration-500 group-hover:scale-105"
                      fill
                      sizes="180px"
                      src={category.imageObjectKey}
                    />
                  ) : null}
                </div>
                <h3 className="mt-3 text-sm font-semibold">{category.name}</h3>
                <p className="mt-0.5 text-xs text-[#857570]">
                  {category._count.products} вариантов
                </p>
              </Link>
            ))}
          </div>
        </section>
        <section className="bg-white py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-7 flex items-end justify-between">
              <div>
                <p className="text-xs font-bold tracking-[0.16em] text-[#8f2d56] uppercase">
                  Выбор NOZI
                </p>
                <h2 className="display-font mt-2 text-3xl sm:text-4xl">
                  Подарки, которые любят
                </h2>
              </div>
              <Link
                className="flex items-center gap-2 text-sm font-semibold"
                href="/catalog"
              >
                Смотреть все <ArrowIcon className="h-4 w-4" />
              </Link>
            </div>
            <ProductGrid products={data.featured} />
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="mb-7">
            <p className="text-xs font-bold tracking-[0.16em] text-[#8f2d56] uppercase">
              Рядом с вами
            </p>
            <h2 className="display-font mt-2 text-3xl sm:text-4xl">
              Популярные магазины
            </h2>
          </div>
          <div className="no-scrollbar flex gap-4 overflow-x-auto pb-5">
            {data.stores.map((store) => (
              <StoreCard key={store.slug} store={store} />
            ))}
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] bg-[#30483e] px-6 py-10 text-white sm:px-12">
            <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
              <div>
                <p className="text-xs font-bold tracking-[0.16em] text-[#d6b794] uppercase">
                  Собрано сегодня
                </p>
                <h2 className="display-font mt-2 text-3xl sm:text-4xl">
                  Свежие идеи для близких
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-[#dbe4df]">
                  Новые композиции от магазинов Душанбе. Каждый подарок можно
                  будет дополнить открыткой на следующем этапе.
                </p>
              </div>
              <Link
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#30483e]"
                href="/catalog?sort=newest"
              >
                Смотреть новинки <ArrowIcon className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
