import { getSellerShell, listSellerProductCategories } from "@nozi/marketplace";
import { SellerProductForm } from "../../../../components/seller-product-form";
import { requireSellerPageActor } from "../../../../lib/require-seller-page";

export default async function NewSellerProductPage() {
  const actor = await requireSellerPageActor();
  const [shell, categories] = await Promise.all([
    getSellerShell(actor),
    listSellerProductCategories(actor),
  ]);
  const store = shell.stores[0];
  const category = categories[0];
  if (!store || !category)
    throw new Error("Seller seed requires a store and category");
  return (
    <>
      <p className="text-xs font-bold tracking-[.18em] text-[#9a355c] uppercase">
        Catalog
      </p>
      <h1 className="mt-2 text-4xl font-semibold">Новый товар</h1>
      <SellerProductForm
        categories={categories}
        stores={shell.stores}
        initial={{
          categoryId: category.id,
          compareAtPrice: null,
          description: "",
          imageAlt: "",
          imageKey: "/images/products/gifts.svg",
          name: "",
          preparationTimeMinutes: 60,
          price: "0.00",
          slug: "",
          status: "DRAFT",
          stockQuantity: 0,
          storeId: store.id,
          variants: [],
        }}
      />
    </>
  );
}
