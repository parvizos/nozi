import Link from "next/link";
import { Permission } from "@nozi/auth";
import { getAdminStore } from "@nozi/marketplace";
import { requireAdminPageActor } from "../../../../lib/require-admin-page";
import { AdminResourceAction } from "../../../../components/admin-resource-action";
export default async function AdminStorePage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const actor = await requireAdminPageActor(Permission.StoresRead);
  const store = await getAdminStore(actor, (await params).storeId);
  const manage = actor.permissions.has(Permission.StoresManage);
  return (
    <>
      <Link
        className="text-sm font-semibold text-[#a22f59]"
        href={`/admin/sellers/${store.sellerId}`}
      >
        ← {store.seller.publicName}
      </Link>
      <h1 className="mt-4 text-4xl font-semibold">{store.name}</h1>
      <p className="mt-2 text-slate-500">
        {store.status} · {store.address?.line1}
      </p>
      {manage ? (
        <div className="mt-5 flex gap-2">
          <AdminResourceAction
            body={{ isActive: true, status: "ACTIVE" }}
            label="Activate"
            path={`/api/v1/admin/stores/${store.id}`}
          />
          <AdminResourceAction
            body={{ status: "PAUSED" }}
            label="Pause"
            path={`/api/v1/admin/stores/${store.id}`}
          />
          <AdminResourceAction
            body={{ isActive: false, status: "SUSPENDED" }}
            label="Suspend"
            path={`/api/v1/admin/stores/${store.id}`}
            tone="danger"
          />
        </div>
      ) : null}
      <section className="mt-7 grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border bg-white p-5">
          <p className="text-slate-500">Products</p>
          <strong className="mt-2 block text-3xl">
            {store._count.products}
          </strong>
        </article>
        <article className="rounded-2xl border bg-white p-5">
          <p className="text-slate-500">Orders</p>
          <strong className="mt-2 block text-3xl">{store._count.orders}</strong>
        </article>
        <article className="rounded-2xl border bg-white p-5">
          <p className="text-slate-500">Seller commission</p>
          <strong className="mt-2 block text-3xl">
            {store.seller.defaultCommissionRate.toFixed(2)}%
          </strong>
        </article>
      </section>
    </>
  );
}
