import { Permission } from "@nozi/auth";
import { listCouriers } from "@nozi/marketplace";
import { requireAdminPageActor } from "../../../lib/require-admin-page";
import { AdminCourierCreate } from "../../../components/admin-courier-create";
import { AdminResourceAction } from "../../../components/admin-resource-action";
export default async function AdminCouriersPage() {
  const couriers = await listCouriers(
    await requireAdminPageActor(Permission.CouriersManage),
  );
  return (
    <>
      <h1 className="text-4xl font-semibold">Курьеры</h1>
      <p className="mt-2 text-slate-500">
        Phase 5 operational foundation и активные назначения.
      </p>
      <div className="mt-6">
        <AdminCourierCreate />
      </div>
      <section className="mt-5 overflow-hidden rounded-2xl border bg-white">
        <div className="divide-y">
          {couriers.map((c) => (
            <div
              className="grid gap-3 p-5 md:grid-cols-[1.4fr_1fr_.8fr_1.2fr_auto] md:items-center"
              key={c.id}
            >
              <span>
                <strong>{c.name}</strong>
                <small className="block text-slate-500">{c.phoneE164}</small>
              </span>
              <span>{c.transportType ?? "—"}</span>
              <span className="font-bold">{c.status}</span>
              <span>
                {c.assignments.map((a) => a.order.orderNumber).join(", ") ||
                  "Нет активных"}
              </span>
              <AdminResourceAction
                body={{
                  isActive: !c.isActive,
                  status: c.isActive ? "SUSPENDED" : "AVAILABLE",
                  transportType: c.transportType,
                }}
                label={c.isActive ? "Deactivate" : "Reactivate"}
                path={`/api/v1/admin/couriers/${c.id}`}
                tone={c.isActive ? "danger" : "default"}
              />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
