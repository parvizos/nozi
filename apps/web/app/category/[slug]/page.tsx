import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCategoryBySlug } from "@nozi/marketplace";
import { CatalogBrowser } from "../../../components/catalog-browser";
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
  const category = await getCategoryBySlug((await params).slug);
  return category
    ? {
        title: category.name,
        description:
          category.description ?? `Подарки в категории ${category.name}`,
      }
    : { title: "Категория не найдена" };
}
export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const [category, query] = await Promise.all([
    getCategoryBySlug(slug),
    searchParams,
  ]);
  if (!category) notFound();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-xs font-bold tracking-[0.16em] text-[#8f2d56] uppercase">
          Категория
        </p>
        <h1 className="display-font mt-2 text-4xl sm:text-5xl">
          {category.name}
        </h1>
        <p className="mt-3 max-w-2xl text-[#756865]">{category.description}</p>
        <div className="mt-10">
          <CatalogBrowser
            basePath={`/category/${slug}`}
            lockedCategory={slug}
            searchParams={query}
          />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
