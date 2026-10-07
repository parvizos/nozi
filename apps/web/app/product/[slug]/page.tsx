import type { Metadata } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getActorContext } from "@nozi/auth";
import { UserRoleCode } from "@nozi/database";
import { getProductBySlug, isFavorite } from "@nozi/marketplace";
import { FavoriteButton } from "../../../components/favorite-button";
import { AddToCart } from "../../../components/add-to-cart";
import { MapPinIcon, StarIcon } from "../../../components/icons";
import { formatMoney } from "../../../components/product-card";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";

type Props = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProductBySlug((await params).slug);
  return product
    ? {
        title: product.name,
        description: product.description,
        openGraph: {
          images: product.images[0]?.objectKey
            ? [product.images[0].objectKey]
            : [],
        },
      }
    : { title: "Товар не найден" };
}
export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const [product, actor] = await Promise.all([
    getProductBySlug(slug),
    getActorContext(await headers()),
  ]);
  if (!product) notFound();
  const canFavorite = actor?.roles.has(UserRoleCode.CUSTOMER) ?? false;
  const favorite =
    actor && canFavorite ? await isFavorite(actor.userId, product.id) : false;
  const preparation =
    product.preparationTimeMinutes ?? product.store.defaultPreparationMinutes;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
        <nav
          aria-label="Хлебные крошки"
          className="mb-6 flex gap-2 text-xs text-[#7b6d68]"
        >
          <Link href="/catalog">Каталог</Link>
          <span>/</span>
          <Link href={`/category/${product.category.slug}`}>
            {product.category.name}
          </Link>
          <span>/</span>
          <span aria-current="page" className="truncate">
            {product.name}
          </span>
        </nav>
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
          <section aria-label="Фотографии товара">
            <div className="grid gap-3 sm:grid-cols-2">
              {product.images.map((image, index) => (
                <div
                  className={`relative overflow-hidden rounded-[1.7rem] bg-[#eee5e0] ${index === 0 ? "aspect-[4/5] sm:row-span-2" : "aspect-square"}`}
                  key={image.id}
                >
                  <Image
                    alt={image.altText}
                    className="object-cover"
                    fill
                    priority={index === 0}
                    sizes="(max-width: 1024px) 90vw, 35vw"
                    src={image.objectKey}
                  />
                </div>
              ))}
            </div>
          </section>
          <section>
            <Link
              className="inline-flex items-center gap-2 text-sm font-medium text-[#6c5d59]"
              href={`/store/${product.store.slug}`}
            >
              {product.store.logoObjectKey ? (
                <span className="relative h-8 w-8 overflow-hidden rounded-full bg-[#eee5e0]">
                  <Image
                    alt=""
                    fill
                    className="object-cover"
                    sizes="32px"
                    src={product.store.logoObjectKey}
                  />
                </span>
              ) : null}
              {product.store.name}
            </Link>
            <h1 className="display-font mt-5 text-4xl leading-tight sm:text-5xl">
              {product.name}
            </h1>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <StarIcon className="h-4 w-4 text-[#d6964d]" />
              <strong>{product.ratingAverage}</strong>
              <span className="text-[#756865]">
                {product.ratingCount} оценок
              </span>
            </div>
            <div className="mt-6 flex items-baseline gap-3">
              <span className="text-2xl font-semibold">
                {formatMoney(product.price, product.currencyCode)}
              </span>
              {product.compareAtPrice ? (
                <span className="text-base text-[#9b8c87] line-through">
                  {formatMoney(product.compareAtPrice, product.currencyCode)}
                </span>
              ) : null}
            </div>
            <p className="mt-6 leading-7 text-[#655753]">
              {product.description}
            </p>
            <AddToCart
              currencyCode={product.currencyCode}
              productId={product.id}
              productPrice={product.price}
              returnTo={`/product/${product.slug}`}
              signedIn={canFavorite}
              variants={product.variants}
            />
            <div className="mt-6 rounded-2xl bg-[#f3eee9] p-4 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <MapPinIcon className="h-4 w-4 text-[#8f2d56]" /> Подготовим
                примерно за {preparation} минут
              </p>
              <p className="mt-1 text-xs text-[#756865]">
                {product.stockQuantity > 0
                  ? `В наличии · ${product.stockQuantity} шт.`
                  : "Нет в наличии"}
              </p>
            </div>
            <div className="mt-4 flex justify-end">
              <FavoriteButton
                initialFavorite={favorite}
                productId={product.id}
                returnTo={`/product/${product.slug}`}
                signedIn={canFavorite}
              />
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
