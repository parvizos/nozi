import { Permission } from "@nozi/auth";
import { listCategoriesAdmin } from "@nozi/marketplace";
import { requireAdminPageActor } from "../../../lib/require-admin-page";
import { AdminCategoryCreate } from "../../../components/admin-category-create";
import { AdminResourceAction } from "../../../components/admin-resource-action";
export default async function AdminCategoriesPage() {
  const categories = await listCategoriesAdmin(
    await requireAdminPageActor(Permission.CategoriesManage),
  );
  return (
    <>
      <h1 className="text-4xl font-semibold">Категории</h1>
      <div className="mt-6">
        <AdminCategoryCreate />
      </div>
      <section className="mt-5 overflow-hidden rounded-2xl border bg-white">
        <div className="divide-y">
          {categories.map((c) => (
            <div
              className="grid gap-3 p-5 md:grid-cols-[.3fr_1.3fr_1fr_1fr_auto] md:items-center"
              key={c.id}
            >
              <strong>#{c.sortOrder}</strong>
              <span>
                <strong>{c.name}</strong>
                <small className="block text-slate-500">/{c.slug}</small>
              </span>
              <span>Parent: {c.parent?.name ?? "—"}</span>
              <span>
                {c._count.products} товаров ·{" "}
                {c.isActive ? "Active" : "Inactive"}
              </span>
              <AdminResourceAction
                body={{ isActive: !c.isActive }}
                label={c.isActive ? "Deactivate" : "Activate"}
                path={`/api/v1/admin/categories/${c.id}`}
                tone={c.isActive ? "danger" : "default"}
              />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
