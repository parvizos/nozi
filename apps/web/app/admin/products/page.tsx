import { Permission } from "@nozi/auth";
import Link from "next/link";
import { adminProductFilterSchema, listAdminProducts } from "@nozi/marketplace";
import { requireAdminPageActor } from "../../../lib/require-admin-page";
import { AdminProductModerationActions } from "../../../components/admin-product-moderation-actions";
export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const input = adminProductFilterSchema.parse({
    page: raw.page,
    query: raw.query,
    status: raw.status,
  });
  const data = await listAdminProducts(
    await requireAdminPageActor(Permission.ProductsModerate),
    input,
  );
  return (
    <>
      <h1 className="text-4xl font-semibold">Product moderation</h1>
      <nav className="mt-5 flex gap-2 overflow-x-auto">
        {[
          ["PENDING_REVIEW", "Ожидают проверки"],
          ["ALL", "Все"],
          ["ACTIVE", "Опубликованы"],
          ["HIDDEN", "Скрыты"],
          ["REJECTED", "Отклонены"],
        ].map(([value, label]) => (
          <Link
            className={
              input.status === value
                ? "rounded-full bg-[#172131] px-4 py-2 text-sm text-white"
                : "rounded-full border bg-white px-4 py-2 text-sm"
            }
            href={`/admin/products?status=${value}`}
            key={value}
          >
            {label}
          </Link>
        ))}
      </nav>
      <form className="mt-5 flex gap-2">
        <input
          className="flex-1 rounded-xl border bg-white px-4 py-3"
          defaultValue={input.query}
          name="query"
          placeholder="Товар или магазин"
        />
        <input name="status" type="hidden" value={input.status} />
        <button className="rounded-xl bg-[#172131] px-5 text-white">
          Найти
        </button>
      </form>
      <section className="mt-5 overflow-hidden rounded-2xl border bg-white">
        <div className="divide-y">
          {data.items.map((p) => (
            <div
              className="grid gap-3 p-5 md:grid-cols-[1.5fr_1fr_.7fr_.8fr_auto] md:items-center"
              key={p.id}
            >
              <span>
                <strong>{p.name}</strong>
                <small className="block text-slate-500">
                  {p.store.name} · {p.category.name}
                </small>
              </span>
              <span>
                {p.price} {p.currencyCode}
              </span>
              <span className="font-bold">
                {p.revisions[0]?.status === "PENDING_REVIEW"
                  ? "PENDING_REVIEW"
                  : p.status}
                {p.revisions[0]?.rejectionReason ? (
                  <small className="block max-w-52 font-normal text-rose-700">
                    {p.revisions[0].rejectionReason}
                  </small>
                ) : null}
              </span>
              <span>Stock {p.stockQuantity - p.reservedQuantity}</span>
              <AdminProductModerationActions
                productId={p.id}
                status={
                  p.revisions[0]?.status === "PENDING_REVIEW"
                    ? "PENDING_REVIEW"
                    : p.status
                }
              />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
