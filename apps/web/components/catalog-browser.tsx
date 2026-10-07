import Link from "next/link";
import {
  listCategories,
  listPopularStores,
  listProducts,
  parseCatalogSearchParams,
} from "@nozi/marketplace";
import { ProductGrid } from "./product-grid";

type SearchParams = Record<string, string | string[] | undefined>;

function pageHref(
  basePath: string,
  params: URLSearchParams,
  page: number,
): string {
  const next = new URLSearchParams(params);
  if (page <= 1) next.delete("page");
  else next.set("page", String(page));
  const query = next.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export async function CatalogBrowser({
  basePath,
  lockedCategory,
  lockedStore,
  searchParams,
}: {
  basePath: string;
  lockedCategory?: string;
  lockedStore?: string;
  searchParams: SearchParams;
}) {
  const parsed = parseCatalogSearchParams({
    ...searchParams,
    category: lockedCategory ?? searchParams.category,
    store: lockedStore ?? searchParams.store,
  });
  const [catalog, categories, stores] = await Promise.all([
    listProducts(parsed),
    listCategories(),
    listPopularStores(20),
  ]);
  const current = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first) current.set(key, first);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[250px_1fr]">
      <aside>
        <form
          action={basePath}
          className="sticky top-28 rounded-3xl border border-[#e8dcd7] bg-white p-5"
          method="get"
        >
          {parsed.query ? (
            <input name="query" type="hidden" value={parsed.query} />
          ) : null}
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Фильтры</h2>
            <Link
              className="text-xs font-medium text-[#8f2d56]"
              href={basePath}
            >
              Сбросить
            </Link>
          </div>
          <div className="mt-5 space-y-5">
            {lockedCategory ? null : (
              <label className="block text-xs font-semibold text-[#625450]">
                Категория
                <select
                  className="mt-2 w-full rounded-xl border border-[#e2d6d1] bg-white px-3 py-2.5 text-sm"
                  defaultValue={parsed.category ?? ""}
                  name="category"
                >
                  <option value="">Все категории</option>
                  {categories.map((category) => (
                    <option key={category.slug} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {lockedStore ? null : (
              <label className="block text-xs font-semibold text-[#625450]">
                Магазин
                <select
                  className="mt-2 w-full rounded-xl border border-[#e2d6d1] bg-white px-3 py-2.5 text-sm"
                  defaultValue={parsed.store ?? ""}
                  name="store"
                >
                  <option value="">Все магазины</option>
                  {stores.map((store) => (
                    <option key={store.slug} value={store.slug}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <fieldset>
              <legend className="text-xs font-semibold text-[#625450]">
                Цена, TJS
              </legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  aria-label="Минимальная цена"
                  className="min-w-0 rounded-xl border border-[#e2d6d1] px-3 py-2.5 text-sm"
                  defaultValue={parsed.minPrice}
                  inputMode="decimal"
                  name="minPrice"
                  placeholder="От"
                />
                <input
                  aria-label="Максимальная цена"
                  className="min-w-0 rounded-xl border border-[#e2d6d1] px-3 py-2.5 text-sm"
                  defaultValue={parsed.maxPrice}
                  inputMode="decimal"
                  name="maxPrice"
                  placeholder="До"
                />
              </div>
            </fieldset>
            <label className="block text-xs font-semibold text-[#625450]">
              Сортировка
              <select
                className="mt-2 w-full rounded-xl border border-[#e2d6d1] bg-white px-3 py-2.5 text-sm"
                defaultValue={parsed.sort}
                name="sort"
              >
                <option value="recommended">Рекомендуем</option>
                <option value="price-asc">Сначала дешевле</option>
                <option value="price-desc">Сначала дороже</option>
                <option value="rating">По рейтингу</option>
                <option value="newest">Новинки</option>
              </select>
            </label>
            <button
              className="w-full rounded-full bg-[#2c2523] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#8f2d56]"
              type="submit"
            >
              Показать
            </button>
          </div>
        </form>
      </aside>
      <section>
        <div className="mb-5 flex items-center justify-between gap-3">
          <p className="text-sm text-[#756865]">
            Найдено: <strong className="text-[#302724]">{catalog.total}</strong>
          </p>
          <span className="text-xs text-[#756865]">
            Страница {catalog.page} из {Math.max(catalog.pageCount, 1)}
          </span>
        </div>
        <ProductGrid products={catalog.items} />
        {catalog.pageCount > 1 ? (
          <nav
            aria-label="Страницы каталога"
            className="mt-10 flex items-center justify-center gap-2"
          >
            {catalog.page > 1 ? (
              <Link
                className="rounded-full border border-[#dfd2cd] bg-white px-4 py-2 text-sm font-medium"
                href={pageHref(basePath, current, catalog.page - 1)}
              >
                Назад
              </Link>
            ) : null}
            <span className="px-3 text-sm text-[#756865]">
              {catalog.page} / {catalog.pageCount}
            </span>
            {catalog.page < catalog.pageCount ? (
              <Link
                className="rounded-full border border-[#dfd2cd] bg-white px-4 py-2 text-sm font-medium"
                href={pageHref(basePath, current, catalog.page + 1)}
              >
                Дальше
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
