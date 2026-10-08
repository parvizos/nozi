import Image from "next/image";
import Link from "next/link";
import {
  listSellerProducts,
  sellerProductFilterSchema,
} from "@nozi/marketplace";
import { SellerProductRowActions } from "../../../components/seller-product-row-actions";
import { requireSellerPageActor } from "../../../lib/require-seller-page";

export default async function SellerProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const filter = sellerProductFilterSchema.parse({ page: raw.page });
  const data = await listSellerProducts(await requireSellerPageActor(), filter);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-bold tracking-[.18em] text-[#9a355c] uppercase">
            Catalog
          </p>
          <h1 className="mt-2 text-4xl font-semibold">Товары</h1>
          <p className="mt-2 text-[#6f6863]">
            Физический остаток включает зарезервированные единицы.
          </p>
        </div>
        <Link
          className="rounded-xl bg-[#8f2d56] px-5 py-3 text-sm font-semibold text-white"
          href="/seller/products/new"
        >
          + Новый товар
        </Link>
      </div>
      <section className="mt-7 overflow-hidden rounded-2xl border border-[#ded9d2] bg-white">
        <div className="hidden grid-cols-[2fr_1fr_.8fr_1fr_1fr_auto] gap-4 border-b bg-[#faf8f5] px-5 py-3 text-xs font-bold text-[#756e69] uppercase md:grid">
          <span>Товар</span>
          <span>Категория</span>
          <span>Цена</span>
          <span>Остаток</span>
          <span>Статус</span>
          <span />
        </div>
        {data.items.length ? (
          <div className="divide-y">
            {data.items.map((product) => (
              <div
                className="grid gap-4 p-5 md:grid-cols-[2fr_1fr_.8fr_1fr_1fr_auto] md:items-center"
                key={product.id}
              >
                <div className="flex items-center gap-3">
                  {product.images[0] ? (
                    <Image
                      alt={product.images[0].altText}
                      className="h-12 w-12 rounded-xl object-cover"
                      height={48}
                      src={product.images[0].objectKey}
                      width={48}
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-xl bg-[#eee9e3]" />
                  )}
                  <div>
                    <strong>{product.name}</strong>
                    <p className="text-xs text-[#756e69]">
                      {product.store.name}
                    </p>
                  </div>
                </div>
                <span className="text-sm">{product.category.name}</span>
                <strong>
                  {product.price} {product.currencyCode}
                </strong>
                <span
                  className={
                    product.availableQuantity <= 5
                      ? "font-semibold text-red-700"
                      : ""
                  }
                >
                  {product.stockQuantity}{" "}
                  <small className="block text-[#756e69]">
                    резерв {product.reservedQuantity} · доступно{" "}
                    {product.availableQuantity}
                  </small>
                </span>
                <span className="text-sm font-semibold">{product.status}</span>
                <SellerProductRowActions id={product.id} />
              </div>
            ))}
          </div>
        ) : (
          <p className="p-14 text-center text-[#756e69]">Товаров пока нет</p>
        )}
      </section>
      <div className="mt-5 flex justify-between text-sm">
        <span>{data.total} товаров</span>
        <div className="flex gap-2">
          {data.page > 1 ? (
            <Link
              className="rounded-lg border bg-white px-4 py-2"
              href={`/seller/products?page=${data.page - 1}`}
            >
              Назад
            </Link>
          ) : null}
          {data.page < data.totalPages ? (
            <Link
              className="rounded-lg border bg-white px-4 py-2"
              href={`/seller/products?page=${data.page + 1}`}
            >
              Далее
            </Link>
          ) : null}
        </div>
      </div>
    </>
  );
}
