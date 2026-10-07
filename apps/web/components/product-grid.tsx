import type { ProductCard as ProductCardData } from "@nozi/marketplace";
import { ProductCard } from "./product-card";
export function ProductGrid({ products }: { products: ProductCardData[] }) {
  if (products.length === 0)
    return (
      <div className="rounded-3xl border border-dashed border-[#d9c8c1] bg-white px-6 py-16 text-center">
        <p className="display-font text-2xl">Пока ничего не нашли</p>
        <p className="mt-2 text-sm text-[#756865]">
          Измените фильтры или попробуйте другой запрос.
        </p>
      </div>
    );
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 md:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
