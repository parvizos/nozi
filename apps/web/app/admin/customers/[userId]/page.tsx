import Link from "next/link";
import { Permission } from "@nozi/auth";
import { getAdminCustomer } from "@nozi/marketplace";
import { orderStatusMetadata } from "@nozi/marketplace/display";
import { requireAdminPageActor } from "../../../../lib/require-admin-page";
import { AdminUserStatusAction } from "../../../../components/admin-user-status-action";
export default async function AdminCustomerPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const actor = await requireAdminPageActor(Permission.CustomersRead);
  const customer = await getAdminCustomer(actor, (await params).userId);
  return (
    <>
      <Link
        className="text-sm font-semibold text-[#a22f59]"
        href="/admin/customers"
      >
        ← Покупатели
      </Link>
      <div className="mt-4 flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">{customer.name}</h1>
          <p className="mt-2 text-slate-500">
            {customer.email} · {customer.phoneNumber ?? "без телефона"} ·{" "}
            {customer.status}
          </p>
        </div>
        {actor.permissions.has(Permission.CustomersManage) ? (
          <AdminUserStatusAction
            label={customer.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
            path={`/api/v1/admin/customers/${customer.id}`}
            status={customer.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED"}
          />
        ) : null}
      </div>
      <section className="mt-7 rounded-2xl border bg-white">
        <h2 className="border-b p-5 text-xl font-semibold">Order history</h2>
        <div className="divide-y">
          {customer.orders.map((o) => (
            <Link
              className="flex justify-between p-5"
              href={`/admin/orders/${o.orderNumber}`}
              key={o.orderNumber}
            >
              <span>
                <strong>{o.orderNumber}</strong>
                <small className="block text-slate-500">
                  {o.store.name} · {orderStatusMetadata[o.status].shortLabel}
                </small>
              </span>
              <strong>{o.grandTotal} TJS</strong>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
