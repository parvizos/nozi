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
  const revision = product.latestRevision;
  const revisionImages = Array.isArray(revision?.images)
    ? (revision.images as { altText: string; objectKey: string }[])
    : [];
  const revisionVariants = Array.isArray(revision?.variants)
    ? (revision.variants as unknown as typeof product.variants)
    : null;
  const editImage = revisionImages[0] ?? image;
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
        moderation={{
          liveStatus: product.status,
          reason: revision?.rejectionReason ?? product.moderationNote,
          revisionStatus: revision?.status ?? null,
        }}
        initial={{
          categoryId: revision?.categoryId ?? product.categoryId,
          compareAtPrice: revision?.compareAtPrice ?? product.compareAtPrice,
          description: revision?.description ?? product.description,
          id: product.id,
          imageAlt: editImage?.altText ?? revision?.name ?? product.name,
          imageKey: editImage?.objectKey ?? "",
          name: revision?.name ?? product.name,
          preparationTimeMinutes: product.preparationTimeMinutes,
          price: revision?.price ?? product.price,
          slug: revision?.slug ?? product.slug,
          status:
            product.status === "PENDING_REVIEW" ||
            revision?.status === "PENDING_REVIEW"
              ? "PENDING_REVIEW"
              : "DRAFT",
          stockQuantity: product.stockQuantity,
          storeId: product.storeId,
          variants: (revisionVariants ?? product.variants)
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
