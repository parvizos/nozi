import Link from "next/link";
import { Permission } from "@nozi/auth";
import { getAdminSeller } from "@nozi/marketplace";
import { requireAdminPageActor } from "../../../../lib/require-admin-page";
import { AdminResourceAction } from "../../../../components/admin-resource-action";
export default async function AdminSellerPage({
  params,
}: {
  params: Promise<{ sellerId: string }>;
}) {
  const actor = await requireAdminPageActor(Permission.SellersRead);
  const seller = await getAdminSeller(actor, (await params).sellerId);
  const canManage = actor.permissions.has(Permission.SellersManage);
  return (
    <>
      <Link
        className="text-sm font-semibold text-[#a22f59]"
        href="/admin/sellers"
      >
        ← Продавцы
      </Link>
      <div className="mt-4 flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">{seller.publicName}</h1>
          <p className="mt-2 text-slate-500">
            {seller.legalName} · {seller.status}
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            {seller.status !== "APPROVED" ? (
              <AdminResourceAction
                body={{ status: "APPROVED" }}
                label="Approve / reactivate"
                path={`/api/v1/admin/sellers/${seller.id}`}
              />
            ) : null}
            <AdminResourceAction
              body={{ reason: "Operational suspension", status: "SUSPENDED" }}
              label="Suspend"
              path={`/api/v1/admin/sellers/${seller.id}`}
              tone="danger"
            />
            <AdminResourceAction
              body={{ reason: "Documents rejected", status: "REJECTED" }}
              label="Reject"
              path={`/api/v1/admin/sellers/${seller.id}`}
              tone="danger"
            />
          </div>
        ) : null}
      </div>
      <div className="mt-7 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <section className="rounded-2xl border bg-white p-6">
          <h2 className="text-xl font-semibold">Магазины</h2>
          <div className="mt-4 divide-y">
            {seller.stores.map((s) => (
              <Link
                className="flex justify-between py-4"
                href={`/admin/stores/${s.id}`}
                key={s.id}
              >
                <span>
                  <strong>{s.name}</strong>
                  <small className="block text-slate-500">{s.status}</small>
                </span>
                <span>
                  {s._count.products} товаров · {s._count.orders} заказов
                </span>
              </Link>
            ))}
          </div>
        </section>
        <aside className="space-y-6">
          <section className="rounded-2xl border bg-white p-6">
            <h2 className="font-semibold">Seller users</h2>
            {seller.users.map((u) => (
              <p className="mt-3 text-sm" key={u.userId}>
                {u.user.name}
                <small className="block text-slate-500">
                  {u.sellerRole} · {u.user.email} · {u.user.status}
                </small>
              </p>
            ))}
          </section>
          <section className="rounded-2xl border bg-amber-50 p-6">
            <h2 className="font-semibold">Internal notes</h2>
            {seller.adminNotes.length ? (
              seller.adminNotes.map((n) => (
                <p className="mt-3 text-sm" key={n.id}>
                  {n.body}
                  <small className="block">{n.author.name}</small>
                </p>
              ))
            ) : (
              <p className="mt-3 text-sm text-slate-500">Нет заметок</p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
