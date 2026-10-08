import { Permission } from "@nozi/auth";
import { adminPageSchema, listAdminProducts } from "@nozi/marketplace";
import { requireAdminPageActor } from "../../../lib/require-admin-page";
import { AdminResourceAction } from "../../../components/admin-resource-action";
export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const input = adminPageSchema.parse({ page: raw.page, query: raw.query });
  const data = await listAdminProducts(
    await requireAdminPageActor(Permission.ProductsModerate),
    input,
  );
  return (
    <>
      <h1 className="text-4xl font-semibold">Product moderation</h1>
      <form className="mt-5 flex gap-2">
        <input
          className="flex-1 rounded-xl border bg-white px-4 py-3"
          defaultValue={input.query}
          name="query"
          placeholder="Товар или магазин"
        />
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
              <span className="font-bold">{p.status}</span>
              <span>Stock {p.stockQuantity - p.reservedQuantity}</span>
              <span className="flex gap-2">
                <AdminResourceAction
                  body={{ status: "ACTIVE" }}
                  label="Approve / show"
                  path={`/api/v1/admin/products/${p.id}`}
                />
                <AdminResourceAction
                  body={{ note: "Hidden by moderation", status: "HIDDEN" }}
                  label="Hide"
                  path={`/api/v1/admin/products/${p.id}`}
                  tone="danger"
                />
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
