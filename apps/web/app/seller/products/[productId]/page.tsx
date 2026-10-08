import { notFound } from "next/navigation";
import {
  getSellerProduct,
  getSellerShell,
  listSellerProductCategories,
  MarketplaceError,
} from "@nozi/marketplace";
import { SellerProductForm } from "../../../../components/seller-product-form";
import { requireSellerPageActor } from "../../../../lib/require-seller-page";

export default async function EditSellerProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  let product;
  let shell;
  let categories;
  try {
    const actor = await requireSellerPageActor();
    [product, shell, categories] = await Promise.all([
      getSellerProduct(actor, (await params).productId),
      getSellerShell(actor),
      listSellerProductCategories(actor),
    ]);
  } catch (error) {
    if (error instanceof MarketplaceError && error.status === 404) notFound();
    throw error;
  }
  const image = product.images[0];
  return (
    <>
      <p className="text-xs font-bold tracking-[.18em] text-[#9a355c] uppercase">
        Catalog
      </p>
      <h1 className="mt-2 text-4xl font-semibold">Редактировать товар</h1>
      <p className="mt-2 text-[#6f6863]">
        Резерв: {product.reservedQuantity} · доступно:{" "}
        {product.stockQuantity - product.reservedQuantity}
      </p>
      <SellerProductForm
        categories={categories}
        stores={shell.stores}
        initial={{
          categoryId: product.categoryId,
          compareAtPrice: product.compareAtPrice,
          description: product.description,
          id: product.id,
          imageAlt: image?.altText ?? product.name,
          imageKey: image?.objectKey ?? "",
          name: product.name,
          preparationTimeMinutes: product.preparationTimeMinutes,
          price: product.price,
          slug: product.slug,
          status: product.status === "ACTIVE" ? "ACTIVE" : "DRAFT",
          stockQuantity: product.stockQuantity,
          storeId: product.storeId,
          variants: product.variants
            .filter((v) => !v.deletedAt)
            .map((v) => ({
              absolutePrice: v.absolutePrice,
              id: v.id,
              isActive: v.isActive,
              name: v.name,
              priceDelta: v.priceDelta,
              sku: v.sku,
              sortOrder: v.sortOrder,
              stockQuantity: v.stockQuantity,
            })),
          version: product.version,
        }}
      />
    </>
  );
}
