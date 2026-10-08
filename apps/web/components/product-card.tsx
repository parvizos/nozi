import Image from "next/image";
import Link from "next/link";
import type { ProductCard as ProductCardData } from "@nozi/marketplace";
import { StarIcon } from "./icons";

export function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat("ru-RU", {
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(Number(amount));
}
export function ProductCard({ product }: { product: ProductCardData }) {
  return (
    <article className="group min-w-0">
      <Link className="block" href={`/product/${product.slug}`}>
        <div className="relative aspect-[4/5] overflow-hidden rounded-[1.4rem] bg-[#f0e7e2]">
          {product.image ? (
            <Image
              alt={product.image.alt}
              className="object-cover transition duration-500 group-hover:scale-[1.035]"
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              src={product.image.src}
            />
          ) : null}
          {product.compareAtPrice ? (
            <span className="absolute top-3 left-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-[#8f2d56] shadow-sm">
              SPECIAL
            </span>
          ) : null}
        </div>
        <div className="pt-3">
          <div className="flex items-center gap-1 text-xs text-[#7b6b67]">
            <StarIcon className="h-3.5 w-3.5 text-[#d6964d]" />
            <span className="font-semibold text-[#473936]">
              {product.rating}
            </span>
            <span>({product.ratingCount})</span>
            <span className="mx-1">·</span>
            <span className="truncate">{product.store.name}</span>
          </div>
          <h3 className="mt-1.5 truncate text-[15px] font-medium text-[#2c2523]">
            {product.name}
          </h3>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-semibold">
              {formatMoney(product.price.amount, product.price.currency)}
            </span>
            {product.compareAtPrice ? (
              <span className="text-xs text-[#9c8f8b] line-through">
                {formatMoney(
                  product.compareAtPrice.amount,
                  product.compareAtPrice.currency,
                )}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </article>
  );
}
